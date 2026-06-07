output "artifact_registry_npm_url" {
  description = "Shared Artifact Registry npm registry URL"
  value       = "https://${google_artifact_registry_repository.npm_packages.location}-npm.pkg.dev/${var.platform_project_id}/${google_artifact_registry_repository.npm_packages.repository_id}"
}

output "artifact_registry_docker_url" {
  description = "Shared Artifact Registry Docker repository URL"
  value       = "${google_artifact_registry_repository.docker_images.location}-docker.pkg.dev/${var.platform_project_id}/${google_artifact_registry_repository.docker_images.repository_id}"
}

output "runtime_artifact_registry_readers" {
  description = "Runtime project service-account principal sets granted Artifact Registry reader access"
  value       = local.runtime_service_account_principal_sets
}

output "artifact_registry_writers" {
  description = "Service accounts granted Artifact Registry writer access"
  value       = var.artifact_registry_writer_service_accounts
}

output "artifact_registry_writer_members" {
  description = "Additional IAM members granted Artifact Registry writer access"
  value       = var.artifact_registry_writer_members
}

output "workspace_terraform_service_account_email" {
  description = "Service account used by Terraform to manage Google Workspace"
  value       = google_service_account.workspace_terraform.email
}

output "workspace_terraform_oauth_client_id" {
  description = "Numeric service account client ID to authorize in Google Workspace domain-wide delegation"
  value       = google_service_account.workspace_terraform.unique_id
}
