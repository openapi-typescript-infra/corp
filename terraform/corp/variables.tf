variable "workspace_customer_id" {
  description = "Google Workspace customer ID (found in Admin Console > Account > Account settings)"
  type        = string
}

variable "workspace_admin_email" {
  description = "Email of a Workspace admin user to impersonate for API calls"
  type        = string
}

variable "organization_domain" {
  description = "Primary domain for the organization (e.g. example.com)"
  type        = string
}
