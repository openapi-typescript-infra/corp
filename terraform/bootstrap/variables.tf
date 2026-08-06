variable "gcp_project_id" {
  description = "GCP project ID used by the provider for bootstrap operations"
  type        = string
  default     = "justtellme-platform"
}

variable "gcp_region" {
  description = "GCP region for the state bucket"
  type        = string
  default     = "us-central1"
}

variable "state_bucket_name" {
  description = "Name of the canonical GCS bucket for Terraform state"
  type        = string
  default     = "justtellme-platform-terraform-state"
}

variable "organization_id" {
  description = "GCP organization ID for project creation"
  type        = string
}

variable "billing_account_id" {
  description = "Billing account ID linked to managed projects"
  type        = string
}

variable "projects" {
  description = "Bootstrap-managed GCP projects"
  type = map(object({
    project_id = string
    name       = string
  }))
  default = {
    platform = {
      project_id = "justtellme-platform"
      name       = "Just Tell Me Platform"
    }
    development = {
      project_id = "justtellme-dev"
      name       = "Just Tell Me Dev"
    }
    production = {
      project_id = "justtellme-prod"
      name       = "Just Tell Me Prod"
    }
  }
}
