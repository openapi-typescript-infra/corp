variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_apis" {
  description = "List of GCP APIs to enable"
  type        = list(string)
}
