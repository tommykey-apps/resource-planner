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
  description = "Email domain allowed to sign in (e.g., genech.co.jp)"
  sensitive   = true
}
