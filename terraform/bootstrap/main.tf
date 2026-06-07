provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

resource "google_project" "projects" {
  for_each = var.projects

  project_id      = each.value.project_id
  name            = each.value.name
  org_id          = var.organization_id
  billing_account = var.billing_account_id

  deletion_policy = "PREVENT"
}

resource "google_billing_project_info" "projects" {
  for_each = google_project.projects

  project         = each.value.project_id
  billing_account = var.billing_account_id
}

resource "google_storage_bucket" "terraform_state" {
  name     = var.state_bucket_name
  project  = google_project.projects["platform"].project_id
  location = var.gcp_region

  versioning {
    enabled = true
  }

  uniform_bucket_level_access = true

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_billing_project_info.projects]
}

output "state_bucket_name" {
  description = "Name of the GCS bucket for Terraform state"
  value       = google_storage_bucket.terraform_state.name
}
