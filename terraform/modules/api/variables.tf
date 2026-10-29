variable "name" {
  description = "Name prefix for resources."
  type        = string
}

variable "source_dir" {
  description = "Folder with the API Lambda code (*.py)."
  type        = string
}

variable "jwt_issuer" {
  description = "Cognito issuer URL."
  type        = string
}

variable "jwt_audience" {
  description = "Cognito app client id."
  type        = string
}

variable "data_table_name" {
  type = string
}

variable "data_table_arn" {
  type = string
}

variable "user_pool_id" {
  description = "Shared user pool: reps groups and friend invites."
  type        = string
}

variable "user_pool_arn" {
  type = string
}

variable "log_retention_days" {
  type    = number
  default = 30
}
