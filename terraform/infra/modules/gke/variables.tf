variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
}

variable "gcp_zone" {
  description = "GCP zone"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "suspended" {
  description = "Scale GKE node pools to zero for idle environments."
  type        = bool
  default     = false
}

variable "gke_config" {
  description = "GKE cluster configuration"
  type = object({
    node_count   = number
    machine_type = string
    disk_size_gb = number
  })
}

variable "network_id" {
  description = "VPC network ID"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID"
  type        = string
}
