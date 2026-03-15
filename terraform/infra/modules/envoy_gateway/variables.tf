variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region for the static IP"
  type        = string
}

variable "environment" {
  description = "Deployment environment (development, production)"
  type        = string
}

variable "envoy_gateway_config" {
  description = "Envoy Gateway configuration"
  type = object({
    chart_version          = optional(string, "v1.3.0")
    control_plane_replicas = optional(number, 2)
  })
}
