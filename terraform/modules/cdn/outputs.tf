output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.this.arn
}

output "domain_name" {
  value = aws_cloudfront_distribution.this.domain_name
}

output "url" {
  value = "https://${coalesce(var.domain_name, aws_cloudfront_distribution.this.domain_name)}"
}

output "web_bucket_name" {
  value = aws_s3_bucket.web.id
}

output "hosted_zone_id" {
  description = "CloudFront's fixed zone id, for Route 53 alias records."
  value       = aws_cloudfront_distribution.this.hosted_zone_id
}
