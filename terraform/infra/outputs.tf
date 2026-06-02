output "environment" {
  description = "Current deployment environment"
  value       = var.environment
}

output "gcp_project_id" {
  description = "GCP project ID"
  value       = var.gcp_project_id
}

output "kubernetes_endpoint" {
  description = "Kubernetes cluster endpoint"
  value       = module.gke.cluster_endpoint
  sensitive   = true
}

output "postgres_connection_info" {
  description = "Cloud SQL Postgres connection info"
  value       = module.cloud_sql.connection_info
  sensitive   = true
}

output "secret_names" {
  description = "Map of logical secret name to Secret Manager resource name"
  value       = module.secrets.secret_names
}

output "pubsub_topics" {
  description = "Map of logical topic name to Pub/Sub topic ID"
  value       = module.pubsub.topic_ids
}

output "artifact_registry_npm_url" {
  description = "Artifact Registry URL for npm packages"
  value       = "https://${google_artifact_registry_repository.npm_packages.location}-npm.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.npm_packages.repository_id}"
}

output "artifact_registry_docker_url" {
  description = "Artifact Registry URL for Docker images"
  value       = "${google_artifact_registry_repository.docker_images.location}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.docker_images.repository_id}"
}

output "github_wif_provider" {
  description = "Workload Identity Federation provider resource name (for GitHub Actions auth)"
  value       = module.github_wif.workload_identity_provider
}

output "github_wif_service_account" {
  description = "GitHub Actions CI service account email"
  value       = module.github_wif.service_account_email
}

output "service_account_emails" {
  description = "Map of service name to GCP service account email (Workload Identity)"
  value = {
    identity-internal = module.identity_internal.gcp_service_account_email
  }
}

output "gateway_ip" {
  description = "Envoy Gateway static IP for ingress"
  value       = module.envoy_gateway.gateway_ip
}

output "cloudflare_dns_hostnames" {
  description = "Map of DNS record key to FQDN"
  value       = module.cloudflare.dns_record_hostnames
}
