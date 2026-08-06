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
    chart_version             = optional(string, "v1.7.2")
    control_plane_replicas    = optional(number, 1)
    control_plane_cpu_request = optional(string, "50m")
  })
}

variable "public_tls_config" {
  description = "Optional public ACME TLS configuration for the Gateway HTTPS listener."
  type = object({
    enabled                 = optional(bool, false)
    cert_manager_version    = optional(string, "v1.16.3")
    acme_email              = optional(string)
    acme_server             = optional(string, "https://acme-v02.api.letsencrypt.org/directory")
    certificate_secret_name = optional(string, "public-gateway-tls")
    dns_names               = optional(list(string), [])
  })
  default = {
    enabled = false
  }
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token used by cert-manager for ACME DNS-01 challenges when public TLS is enabled."
  type        = string
  default     = null
  sensitive   = true
}
