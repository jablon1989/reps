locals {
  name     = "${var.project}-${var.environment}"
  repo_dir = "${path.root}/../../.."

  site_url = module.cdn.url
  # The *.cloudfront.net address keeps working next to the own domain.
  cloudfront_url = "https://${module.cdn.domain_name}"
  local_dev_urls = var.enable_local_dev ? ["http://localhost:5174"] : []
  app_origins    = concat(distinct([local.site_url, local.cloudfront_url]), local.local_dev_urls)
}

# Login: an app client on the shared pusiaczkowo.pl user pool.
module "auth" {
  source = "../../modules/auth"

  name           = local.name
  user_pool_name = var.user_pool_name
  login_domain   = "login.${var.domain_zone}"
  callback_urls  = [for o in local.app_origins : "${o}/"]
  logout_urls    = [for o in local.app_origins : "${o}/"]
}

module "storage" {
  source = "../../modules/storage"

  name = local.name
}

module "api" {
  source = "../../modules/api"

  name         = local.name
  source_dir   = "${local.repo_dir}/app/backend/api"
  jwt_issuer   = module.auth.issuer_url
  jwt_audience = module.auth.client_id

  # Access (the reps groups) and friend invites live in the shared user pool.
  user_pool_id  = module.auth.user_pool_id
  user_pool_arn = module.auth.user_pool_arn

  data_table_name = module.storage.data_table_name
  data_table_arn  = module.storage.data_table_arn
}

module "cdn" {
  source = "../../modules/cdn"

  name            = local.name
  api_domain_name = module.api.api_domain_name
  domain_name     = var.domain_name
  certificate_arn = local.use_domain ? data.aws_acm_certificate.shared[0].arn : null
}

module "monitoring" {
  source = "../../modules/monitoring"

  name                  = local.name
  alert_email           = var.alert_email
  api_id                = module.api.api_id
  monthly_budget_usd    = var.monthly_budget_usd
  lambda_function_names = [module.api.function_name]
}

# Runtime settings for the React app. Terraform owns this file, so the same
# frontend build works in any environment. The deploy step must not delete it.
resource "aws_s3_object" "frontend_config" {
  bucket        = module.cdn.web_bucket_name
  key           = "config.json"
  content_type  = "application/json"
  cache_control = "no-cache"
  content = jsonencode({
    region        = var.region
    authority     = module.auth.issuer_url
    clientId      = module.auth.client_id
    cognitoDomain = module.auth.hosted_ui_domain
  })
}
