variable "project" {
  type    = string
  default = "reps"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "region" {
  type    = string
  default = "eu-central-1"
}

variable "alert_email" {
  description = "E-mail for alarms and budget alerts."
  type        = string
  sensitive   = true
}

variable "monthly_budget_usd" {
  type    = number
  default = 5
}

variable "enable_local_dev" {
  description = "Allow logins from http://localhost:5174 (npm run dev)."
  type        = bool
  default     = true
}

variable "domain_name" {
  description = "Own hostname for the app. null = only the *.cloudfront.net address."
  type        = string
  default     = "reps.pusiaczkowo.pl"
}

variable "domain_zone" {
  description = "Shared Route 53 zone + wildcard certificate (managed in jablon1989/aura-the-husky, terraform/)."
  type        = string
  default     = "pusiaczkowo.pl"
}

variable "user_pool_name" {
  description = "The shared login (jablon1989/aura-the-husky, terraform/login.tf)."
  type        = string
  default     = "aurathehusky-users"
}
