provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

resource "google_storage_bucket" "terraform_state" {
  name     = "${var.gcp_project_id}-terraform-state"
  location = var.gcp_region

  versioning {
    enabled = true
  }

  uniform_bucket_level_access = true

  lifecycle {
    prevent_destroy = true
  }
}

output "state_bucket_name" {
  description = "Name of the GCS bucket for Terraform state"
  value       = google_storage_bucket.terraform_state.name
}
