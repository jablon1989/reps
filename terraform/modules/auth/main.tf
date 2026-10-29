# Login through the shared user pool of pusiaczkowo.pl (one login for all our
# apps, managed in jablon1989/aura-the-husky, terraform/login.tf). This app only
# adds its own app client: which addresses may log in, token lifetimes.

data "aws_cognito_user_pools" "shared" {
  name = var.user_pool_name
}

locals {
  user_pool_id = one(data.aws_cognito_user_pools.shared.ids)
}

# Public client for the React app (Authorization Code + PKCE, no secret).
resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name}-web"
  user_pool_id = local.user_pool_id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls

  explicit_auth_flows           = ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}
