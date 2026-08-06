output "gcp_service_account_email" {
  description = "Email of the runtime GCP service account."
  value       = google_service_account.service.email
}

output "k8s_service_account_name" {
  description = "Name of the Kubernetes service account."
  value       = kubernetes_service_account.service.metadata[0].name
}
