variable "platform_project_id" {
  description = "GCP project ID for shared platform resources"
  type        = string
  default     = "justtellme-platform"
}

variable "runtime_projects" {
  description = "Runtime GCP projects that need access to shared platform resources"
  type        = map(string)
  default = {
    development = "justtellme-dev"
    production  = "justtellme-prod"
  }
}

variable "gcp_region" {
  description = "GCP region for shared resources"
  type        = string
  default     = "us-central1"
}

variable "artifact_registry_docker_cleanup" {
  description = "Cleanup policy for shared Docker images in Artifact Registry."
  type = object({
    dry_run                    = optional(bool, false)
    keep_count                 = optional(number, 10)
    delete_tagged_older_than   = optional(string, "2592000s")
    delete_untagged_older_than = optional(string, "604800s")
  })
  default = {}
}

variable "artifact_registry_writer_service_accounts" {
  description = "Service account emails allowed to publish shared artifacts."
  type        = list(string)
  default = [
    "github-actions-ci@justtellme-dev.iam.gserviceaccount.com",
  ]
}
