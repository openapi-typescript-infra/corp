variable "environment" {
  description = "Deployment environment (development, production)"
  type        = string

  validation {
    condition     = contains(["development", "production"], var.environment)
    error_message = "Environment must be one of: development, production."
  }
}

variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "gcp_zone" {
  description = "GCP zone for zonal resources"
  type        = string
  default     = "us-central1-a"
}

variable "suspended" {
  description = "Reduce idle development costs by scaling compute to zero and stopping Cloud SQL."
  type        = bool
  default     = false
}

variable "k8s_namespace" {
  description = "Kubernetes namespace for application workloads."
  type        = string
  default     = "app"
}

variable "artifact_registry_docker_cleanup" {
  description = "Cleanup policy for Docker images in Artifact Registry."
  type = object({
    dry_run                    = optional(bool, false)
    keep_count                 = optional(number, 3)
    delete_tagged_older_than   = optional(string, "604800s")
    delete_untagged_older_than = optional(string, "86400s")
  })
  default = {}
}

variable "postgres_instances" {
  description = "Map of Postgres instance configurations"
  type = map(object({
    tier              = optional(string, "db-f1-micro")
    activation_policy = optional(string, "ALWAYS")
    databases         = list(string)
  }))
  default = {}
}

variable "secrets" {
  description = "List of secret names to create in Secret Manager"
  type        = list(string)
  default     = []
}

variable "pubsub_topics" {
  description = "Map of Pub/Sub topic names to their subscription configurations"
  type = map(object({
    subscriptions = list(string)
  }))
  default = {}
}

variable "gke_config" {
  description = "GKE cluster configuration"
  type = object({
    node_count   = optional(number, 1)
    machine_type = optional(string, "e2-medium")
    disk_size_gb = optional(number, 50)
  })
  default = null
}

variable "envoy_gateway_config" {
  description = "Envoy Gateway configuration"
  type = object({
    chart_version             = optional(string, "v1.7.2")
    control_plane_replicas    = optional(number, 1)
    control_plane_cpu_request = optional(string, "50m")
  })
  default = null
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID"
  type        = string
  default     = ""
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token used by Terraform to manage DNS and WAF. Prefer TF_VAR_cloudflare_api_token or a local uncommitted tfvars file."
  type        = string
  default     = null
  sensitive   = true
}

variable "stytch_workspace_key_id" {
  description = "Stytch workspace management key ID used by Terraform. Prefer TF_VAR_stytch_workspace_key_id or the Makefile-loaded GSM secret."
  type        = string
  default     = null
  sensitive   = true
}

variable "stytch_workspace_key_secret" {
  description = "Stytch workspace management key secret used by Terraform. Prefer TF_VAR_stytch_workspace_key_secret or the Makefile-loaded GSM secret."
  type        = string
  default     = null
  sensitive   = true
}

variable "stytch_project" {
  description = "Optional Stytch project managed by Terraform. If null, Stytch project/environment resources are skipped."
  type = object({
    name         = string
    project_slug = optional(string)
    vertical     = optional(string, "CONSUMER")
    live_environment = optional(object({
      name             = string
      environment_slug = optional(string, "production")
    }))
  })
  default = null
}

variable "stytch_environment" {
  description = "Stytch environment to manage in this Terraform environment. For production, use the live environment on stytch_project; for non-production, use a TEST environment."
  type = object({
    name             = string
    environment_slug = string
    type             = optional(string, "TEST")
  })
  default = null
}

variable "stytch_project_slug" {
  description = "Existing Stytch project slug to use when stytch_project is not managed by Terraform."
  type        = string
  default     = ""
}

variable "stytch_environment_slug" {
  description = "Existing Stytch environment slug to use when stytch_environment is not managed by Terraform."
  type        = string
  default     = ""
}

variable "stytch_redirect_urls" {
  description = "Stytch redirect URLs to manage for this environment."
  type = map(object({
    url = string
    valid_types = set(object({
      type       = string
      is_default = optional(bool, false)
    }))
  }))
  default = {}
}

variable "dev_secret_accessor_member" {
  description = "Optional IAM member granted Secret Manager access in development, for example group:developers@example.com."
  type        = string
  default     = null
}

variable "cloudflare_dns_records" {
  description = "Map of DNS records to manage in Cloudflare"
  type = map(object({
    name    = string
    type    = optional(string, "A")
    content = optional(string)
    proxied = optional(bool, true)
  }))
  default = {}
}

variable "public_tls_config" {
  description = "Optional public ACME TLS configuration for Envoy Gateway. Intended for DNS-only development hosts."
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

variable "cloudflare_waf_enabled" {
  description = "Enable Cloudflare WAF rate limiting"
  type        = bool
  default     = false
}

variable "cloudflare_waf_rate_limit_rps" {
  description = "Requests per minute before Cloudflare rate limiting"
  type        = number
  default     = 1000
}

variable "github_repo" {
  description = "GitHub repository in 'owner/repo' format for Workload Identity Federation"
  type        = string
  default     = "just-tell-me/just-tell-me"
}
