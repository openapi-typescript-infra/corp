variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "postgres_instances" {
  description = "Map of Postgres instance configurations"
  type = map(object({
    tier      = string
    databases = list(string)
  }))
}

variable "network_id" {
  description = "VPC network ID for private IP connectivity"
  type        = string
}
