variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "service" {
  description = "Service ID. Matches services/<service> and is used for <service>-sa identities."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]*[a-z0-9]$", var.service))
    error_message = "Service ID must be lowercase, start with a letter, and contain only letters, digits, and hyphens."
  }
}

variable "k8s_namespace" {
  description = "Kubernetes namespace where the service account lives."
  type        = string
}

variable "extra_project_roles" {
  description = "Additional project-level IAM roles granted to the runtime GCP service account."
  type        = set(string)
  default     = []
}

variable "secret_accessor_secrets" {
  description = "Secret Manager secret IDs this service can read via gsm:<secret> config values."
  type        = set(string)
  default     = []
}

variable "cloudsql_instances" {
  description = "Logical Cloud SQL instance keys this service can access through IAM database auth."
  type        = set(string)
  default     = []
}

variable "cloudsql_instance_names" {
  description = "Map of logical Cloud SQL instance key to actual instance name."
  type        = map(string)
  default     = {}
}
