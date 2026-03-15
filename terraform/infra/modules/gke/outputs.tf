output "cluster_endpoint" {
  description = "GKE cluster endpoint"
  value       = google_container_cluster.cluster.endpoint
  sensitive   = true
}

output "cluster_name" {
  description = "GKE cluster name"
  value       = google_container_cluster.cluster.name
}

output "cluster_ca_certificate" {
  description = "GKE cluster CA certificate"
  value       = google_container_cluster.cluster.master_auth[0].cluster_ca_certificate
  sensitive   = true
}
