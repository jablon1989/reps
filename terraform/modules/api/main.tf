data "aws_region" "current" {}

locals {
  function_name = "${var.name}-api"

  # Explicit routes – every one requires a valid Cognito login.
  # Keep in sync with ROUTES in app/backend/api/handler.py.
  routes = [
    "GET /api/me",
    "PUT /api/me/settings",
    "GET /api/admin/people",
    "POST /api/admin/invites",
    "GET /api/exercises",
    "POST /api/exercises",
    "PATCH /api/exercises/{exerciseId}",
    "DELETE /api/exercises/{exerciseId}",
    "GET /api/exercises/{exerciseId}/history",
    "GET /api/sets",
    "GET /api/sets/all",
    "PUT /api/sets/{setId}",
    "DELETE /api/sets/{setId}",
    "POST /api/import/parse",
    "POST /api/import/exercises",
    "POST /api/import/sets",
    "POST /api/import/extras",
    "GET /api/docs",
    "PUT /api/docs/{kind}/{docId}",
    "DELETE /api/docs/{kind}/{docId}",
    "GET /api/drive",
    "POST /api/drive/connect",
    "POST /api/drive/callback",
    "POST /api/drive/export",
    "DELETE /api/drive",
    "DELETE /api/import",
  ]
}

# ---------------------------------------------------------------------------
# Lambda
# ---------------------------------------------------------------------------
data "archive_file" "api" {
  type        = "zip"
  output_path = "${path.root}/.build/api.zip"

  dynamic "source" {
    for_each = fileset(var.source_dir, "*.{py,json}")
    content {
      content  = file("${var.source_dir}/${source.value}")
      filename = source.value
    }
  }
}

data "aws_iam_policy_document" "assume_lambda" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = local.function_name
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "api" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }

  statement {
    sid = "Tables"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [var.data_table_arn, "${var.data_table_arn}/index/*"]
  }

  # Who has access, and inviting friends (Cognito e-mails the invite).
  statement {
    sid = "People"
    actions = [
      "cognito-idp:ListUsersInGroup",
      "cognito-idp:AdminGetUser",
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminAddUserToGroup",
    ]
    resources = [var.user_pool_arn]
  }

  # The Google OAuth client for Drive backups (a SecureString made by hand, see README).
  statement {
    sid       = "GoogleOAuthClient"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter${var.google_oauth_param}"]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "api"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name    = local.function_name
  role             = aws_iam_role.api.arn
  runtime          = "python3.13"
  architectures    = ["arm64"]
  handler          = "handler.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  memory_size      = 256
  timeout          = 29 # imports write up to 1000 sets per call; API Gateway waits 30 s

  environment {
    variables = {
      DATA_TABLE         = var.data_table_name
      USER_POOL_ID       = var.user_pool_id
      GOOGLE_OAUTH_PARAM = var.google_oauth_param
      APP_ORIGINS        = join(",", var.app_origins)
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.api.name
  }

  depends_on = [aws_iam_role_policy.api]
}

# ---------------------------------------------------------------------------
# HTTP API with a Cognito JWT authorizer
# ---------------------------------------------------------------------------
resource "aws_apigatewayv2_api" "this" {
  name          = "${var.name}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.this.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = var.jwt_issuer
    audience = [var.jwt_audience]
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "this" {
  for_each = toset(local.routes)

  api_id             = aws_apigatewayv2_api.this.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.name}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 20
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId = "$context.requestId"
      ip        = "$context.identity.sourceIp"
      time      = "$context.requestTime"
      route     = "$context.routeKey"
      status    = "$context.status"
      latencyMs = "$context.responseLatency"
      user      = "$context.authorizer.claims.name"
      error     = "$context.authorizer.error"
    })
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# Weekly Google Drive backups: the same Lambda, every Monday morning
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "assume_scheduler" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "drive_weekly" {
  name               = "${var.name}-drive-weekly"
  assume_role_policy = data.aws_iam_policy_document.assume_scheduler.json
}

resource "aws_iam_role_policy" "drive_weekly" {
  name = "invoke-api"
  role = aws_iam_role.drive_weekly.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.api.arn
    }]
  })
}

resource "aws_scheduler_schedule" "drive_weekly" {
  name                         = "${var.name}-drive-weekly"
  description                  = "Back up everyone's reps data to their Google Drive"
  schedule_expression          = var.drive_schedule
  schedule_expression_timezone = "Europe/Warsaw"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.api.arn
    role_arn = aws_iam_role.drive_weekly.arn
    input    = jsonencode({ action = "drive_weekly" })

    retry_policy {
      maximum_retry_attempts = 2
    }
  }
}
