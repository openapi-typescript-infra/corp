variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "k8s_namespace" {
  description = "Kubernetes namespace for service accounts"
  type        = string
  default     = "default"
}

variable "service_accounts" {
  description = "Map of service name to its configuration"
  type = map(object({
    roles              = optional(set(string), [])
    gsm_secrets        = optional(set(string), [])
    cloudsql_instances = optional(set(string), [])
    k8s_namespace      = optional(string)
  }))
  default = {}
}

variable "cloudsql_instance_names" {
  description = "Map of logical instance key to Cloud SQL instance name (from cloud_sql module)"
  type        = map(string)
  default     = {}
}
