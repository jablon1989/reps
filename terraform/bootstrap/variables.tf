variable "project" {
  description = "Short project name used in resource names."
  type        = string
  default     = "reps"
}

variable "region" {
  description = "AWS region for the project."
  type        = string
  default     = "eu-central-1"
}

variable "github_repository" {
  description = "GitHub repository allowed to deploy, as owner/name."
  type        = string
  default     = "jablon1989/reps"
}

variable "github_sub_prefix" {
  description = <<-EOT
    Start of the GitHub OIDC token "sub" claim. Default: "repo:<owner>/<name>".
    Repos using GitHub's immutable subject format send "repo:<owner>@<id>/<name>@<id>" instead –
    see: gh api repos/<owner>/<name>/actions/oidc/customization/sub (sub_claim_prefix).
  EOT
  type        = string
  # This repo uses the immutable format (gh api repos/jablon1989/reps/actions/oidc/customization/sub).
  default = "repo:jablon1989@89132335/reps@1438907393"
}

variable "github_environment" {
  description = "GitHub Actions environment whose jobs may apply changes."
  type        = string
  default     = "prod"
}

variable "create_github_oidc_provider" {
  description = "The account's GitHub OIDC provider is managed by jablon1989/aura-the-husky (terraform/), so reuse it."
  type        = bool
  default     = false
}
