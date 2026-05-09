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

variable "clerk_publishable_key" {
  type        = string
  description = "Clerk publishable key (PUBLIC_CLERK_PUBLISHABLE_KEY)"
  sensitive   = true
}

variable "clerk_secret_key" {
  type        = string
  description = "Clerk secret key (CLERK_SECRET_KEY)"
  sensitive   = true
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
