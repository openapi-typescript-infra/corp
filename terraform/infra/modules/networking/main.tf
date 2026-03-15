resource "google_compute_network" "vpc" {
  name                    = "${var.environment}-vpc"
  project                 = var.gcp_project_id
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "${var.environment}-subnet"
  project       = var.gcp_project_id
  region        = var.gcp_region
  network       = google_compute_network.vpc.id
  ip_cidr_range = "10.0.0.0/20"

  secondary_ip_range {
    range_name    = "${var.environment}-pods"
    ip_cidr_range = "10.4.0.0/14"
  }

  secondary_ip_range {
    range_name    = "${var.environment}-services"
    ip_cidr_range = "10.8.0.0/20"
  }
}

resource "google_compute_global_address" "private_ip" {
  name          = "${var.environment}-private-ip"
  project       = var.gcp_project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip.name]
}
