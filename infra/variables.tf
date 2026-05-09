variable "project" {
  type    = string
  default = "resource-planner"
}

variable "region" {
  type    = string
  default = "ap-northeast-1"
}

variable "domain" {
  type    = string
  default = "planner.tommykeyapp.com"
}

variable "allowed_domain" {
  type        = string
  description = "Email domain allowed to sign in (set via TF_VAR_allowed_domain or GitHub Secret, never commit literal value)"
  sensitive   = true
}

variable "email_from" {
  type        = string
  description = "Auth.js Magic Link sender (must be on aws_ses_domain_identity.main.domain)"
  default     = "noreply@tommykeyapp.com"
}
