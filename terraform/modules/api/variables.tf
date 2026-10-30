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

variable "google_oauth_param" {
  description = "SSM SecureString with the Google OAuth client for Drive backups: {\"client_id\", \"client_secret\"}."
  type        = string
}

variable "app_origins" {
  description = "The app's addresses (Google sends people back to <origin>/drive/callback)."
  type        = list(string)
}

variable "drive_schedule" {
  description = "When the weekly Drive backups run (EventBridge Scheduler, Polish time)."
  type        = string
  default     = "cron(0 3 ? * MON *)"
}
