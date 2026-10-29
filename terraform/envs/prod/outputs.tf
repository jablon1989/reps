output "site_url" {
  description = "Open this in the browser (on your phone too)."
  value       = module.cdn.url
}

output "cloudfront_domain" {
  value = module.cdn.domain_name
}

output "web_bucket_name" {
  value = module.cdn.web_bucket_name
}

output "distribution_id" {
  value = module.cdn.distribution_id
}

output "frontend_config" {
  description = "Same content as /config.json (used for local dev)."
  value       = aws_s3_object.frontend_config.content
}
