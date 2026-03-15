variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "secrets" {
  description = "List of secret names to create"
  type        = list(string)
}
