variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region for the state bucket"
  type        = string
  default     = "us-central1"
}
