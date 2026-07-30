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

variable "datastream_config" {
  description = "Optional PostgreSQL-to-BigQuery CDC infrastructure. Null or enabled=false disables all Datastream resources."
  type = object({
    enabled                      = optional(bool, false)
    psc_subnet_cidr              = optional(string, "172.16.0.0/28")
    psc_producer_projects        = optional(list(string), [])
    data_freshness               = optional(string, "900s")
    bootstrap_image              = optional(string, "postgres:18-alpine")
    backfill_concurrency         = optional(number, 1)
    reporting_dataset_id         = optional(string, "reporting")
    reporting_staging_dataset_id = optional(string, "reporting_staging")
    raw_dataset_prefix           = optional(string, "raw_")
    sources = optional(map(object({
      instance_key     = string
      database         = string
      schema           = optional(string, "public")
      publication      = optional(string)
      replication_slot = optional(string)
    })), {})
  })
  default = null

  validation {
    condition = var.datastream_config == null ? true : alltrue([
      for source in var.datastream_config.sources :
      contains(keys(var.postgres_instances), source.instance_key) &&
      contains(var.postgres_instances[source.instance_key].databases, source.database)
    ])
    error_message = "Every Datastream source must reference a configured Postgres instance and database."
  }

  validation {
    condition     = var.datastream_config == null ? true : can(regex("^[1-9][0-9]*s$", var.datastream_config.data_freshness))
    error_message = "Datastream data_freshness must be a whole-second duration such as 900s."
  }

  validation {
    condition = var.datastream_config == null ? true : (
      !var.datastream_config.enabled ||
      (length(var.datastream_config.sources) > 0 && length(var.datastream_config.psc_producer_projects) > 0)
    )
    error_message = "Enabled Datastream configuration requires at least one source and PSC producer project."
  }
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

variable "monitoring_config" {
  description = "Optional Cloud Monitoring uptime checks and Kubernetes workload alerts."
  type = object({
    enabled                 = optional(bool, false)
    notification_email      = optional(string)
    uptime_period           = optional(string, "300s")
    uptime_timeout          = optional(string, "10s")
    uptime_failure_duration = optional(string, "120s")
    error_count_window      = optional(string, "300s")
    error_count_threshold   = optional(number, 10)
    restart_count_window    = optional(string, "300s")
    restart_count_threshold = optional(number, 3)
    workload_names          = optional(set(string), [])
    uptime_targets = optional(map(object({
      dns_record_key      = string
      path                = optional(string, "/")
      request_method      = optional(string, "GET")
      content_type        = optional(string)
      custom_content_type = optional(string)
      body                = optional(string)
      expected_content    = optional(string)
    })), {})
  })
  default = {
    enabled = false
  }

  validation {
    condition     = contains(["60s", "300s", "600s", "900s"], var.monitoring_config.uptime_period)
    error_message = "Monitoring uptime_period must be one of 60s, 300s, 600s, or 900s."
  }

  validation {
    condition = alltrue([
      for duration in [
        var.monitoring_config.uptime_timeout,
        var.monitoring_config.uptime_failure_duration,
        var.monitoring_config.error_count_window,
        var.monitoring_config.restart_count_window,
      ] : can(regex("^[1-9][0-9]*s$", duration))
    ])
    error_message = "Monitoring durations must be whole-second durations such as 120s."
  }

  validation {
    condition = (
      var.monitoring_config.error_count_threshold >= 1 &&
      var.monitoring_config.restart_count_threshold >= 1
    )
    error_message = "Monitoring alert thresholds must be at least 1."
  }

  validation {
    condition = (
      var.monitoring_config.notification_email == null ||
      can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", var.monitoring_config.notification_email))
    )
    error_message = "Monitoring notification_email must be a valid email address."
  }

  validation {
    condition = alltrue([
      for target in values(var.monitoring_config.uptime_targets) :
      contains(keys(var.cloudflare_dns_records), target.dns_record_key)
    ])
    error_message = "Every monitoring uptime target must reference a configured Cloudflare DNS record key."
  }
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
