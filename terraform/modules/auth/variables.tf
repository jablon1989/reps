variable "name" {
  description = "Name prefix for resources."
  type        = string
}

variable "user_pool_name" {
  description = "Name of the shared user pool (aura-the-husky terraform output user_pool_name)."
  type        = string
}

variable "login_domain" {
  description = "Hostname of the shared login page, e.g. login.pusiaczkowo.pl."
  type        = string
}

variable "callback_urls" {
  description = "URLs Cognito may redirect to after login."
  type        = list(string)
}

variable "logout_urls" {
  description = "URLs Cognito may redirect to after logout."
  type        = list(string)
}
