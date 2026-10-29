data "aws_region" "current" {}

output "user_pool_id" {
  value = local.user_pool_id
}

output "user_pool_arn" {
  value = one(data.aws_cognito_user_pools.shared.arns)
}

output "client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "issuer_url" {
  description = "OIDC issuer (also the JWT authorizer issuer)."
  value       = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${local.user_pool_id}"
}

output "hosted_ui_domain" {
  value = "https://${var.login_domain}"
}
