variable "name" {
  description = "Name prefix for resources."
  type        = string
}

variable "alert_email" {
  description = "Where alarms and budget alerts go."
  type        = string
  sensitive   = true
}

variable "lambda_function_names" {
  type = list(string)
}

variable "api_id" {
  type = string
}

variable "monthly_budget_usd" {
  type    = number
  default = 10
}
