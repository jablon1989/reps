variable "name" {
  description = "Name prefix for resources."
  type        = string
}

variable "api_domain_name" {
  description = "API Gateway hostname (without https://)."
  type        = string
}

variable "price_class" {
  description = "CloudFront price class. PriceClass_100 = Europe + North America edges."
  type        = string
  default     = "PriceClass_100"
}

variable "domain_name" {
  description = "Own hostname, e.g. reps.pusiaczkowo.pl. null = use the *.cloudfront.net address."
  type        = string
  default     = null
}

variable "certificate_arn" {
  description = "ACM certificate in us-east-1 that covers domain_name (e.g. the shared *.pusiaczkowo.pl wildcard)."
  type        = string
  default     = null

  validation {
    condition     = (var.domain_name == null) == (var.certificate_arn == null)
    error_message = "Set both domain_name and certificate_arn, or neither."
  }
}
