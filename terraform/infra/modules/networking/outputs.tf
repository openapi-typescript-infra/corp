output "network_id" {
  description = "VPC network ID"
  value       = google_compute_network.vpc.id
}

output "subnet_id" {
  description = "Subnet ID"
  value       = google_compute_subnetwork.subnet.id
}

output "network_name" {
  description = "VPC network name"
  value       = google_compute_network.vpc.name
}
