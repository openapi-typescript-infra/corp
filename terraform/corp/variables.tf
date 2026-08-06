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

variable "workspace_terraform_service_account_email" {
  description = "Service account authorized for Google Workspace domain-wide delegation."
  type        = string
  default     = "workspace-terraform@justtellme-platform.iam.gserviceaccount.com"
}

variable "googleworkspace_access_token" {
  description = "Optional short-lived access token for the Workspace Terraform service account."
  type        = string
  sensitive   = true
  default     = null
}
