resource "google_container_cluster" "cluster" {
  name     = "${var.environment}-cluster"
  project  = var.gcp_project_id
  location = var.gcp_zone

  network    = var.network_id
  subnetwork = var.subnet_id

  initial_node_count       = 1
  remove_default_node_pool = true

  ip_allocation_policy {
    cluster_secondary_range_name  = "${var.environment}-pods"
    services_secondary_range_name = "${var.environment}-services"
  }

  release_channel {
    channel = "REGULAR"
  }

  workload_identity_config {
    workload_pool = "${var.gcp_project_id}.svc.id.goog"
  }

  gateway_api_config {
    channel = "CHANNEL_DISABLED"
  }

  deletion_protection = false
}

resource "google_container_node_pool" "primary" {
  name     = "${var.environment}-primary-pool"
  project  = var.gcp_project_id
  location = var.gcp_zone
  cluster  = google_container_cluster.cluster.name

  node_count = var.gke_config.node_count

  node_config {
    machine_type = var.gke_config.machine_type
    disk_size_gb = var.gke_config.disk_size_gb

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }
}
