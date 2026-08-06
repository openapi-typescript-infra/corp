terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.platform_project_id
  region  = var.gcp_region
}

locals {
  service_apis = [
    "admin.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
  ]

  runtime_service_account_principal_sets = {
    for key, project in data.google_project.runtime :
    key => "principalSet://cloudresourcemanager.googleapis.com/projects/${project.number}/type/ServiceAccount"
  }
}

data "google_project" "runtime" {
  for_each = var.runtime_projects

  project_id = each.value
}

resource "google_project_service" "apis" {
  for_each = toset(local.service_apis)

  project = var.platform_project_id
  service = each.value

  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "npm_packages" {
  repository_id = "npm-packages"
  location      = var.gcp_region
  format        = "NPM"
  description   = "Shared npm package registry"

  depends_on = [google_project_service.apis]
}

resource "google_artifact_registry_repository" "docker_images" {
  repository_id          = "docker-images"
  location               = var.gcp_region
  format                 = "DOCKER"
  description            = "Shared Docker image registry"
  cleanup_policy_dry_run = var.artifact_registry_docker_cleanup.dry_run

  cleanup_policies {
    id     = "keep-recent-versions"
    action = "KEEP"

    most_recent_versions {
      keep_count = var.artifact_registry_docker_cleanup.keep_count
    }
  }

  cleanup_policies {
    id     = "delete-old-tagged"
    action = "DELETE"

    condition {
      tag_state  = "TAGGED"
      older_than = var.artifact_registry_docker_cleanup.delete_tagged_older_than
    }
  }

  cleanup_policies {
    id     = "delete-old-untagged"
    action = "DELETE"

    condition {
      tag_state  = "UNTAGGED"
      older_than = var.artifact_registry_docker_cleanup.delete_untagged_older_than
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_project_iam_member" "runtime_artifact_registry_readers" {
  for_each = local.runtime_service_account_principal_sets

  project = var.platform_project_id
  role    = "roles/artifactregistry.reader"
  member  = each.value

  depends_on = [google_project_service.apis]
}

resource "google_project_iam_member" "artifact_registry_writers" {
  for_each = toset(var.artifact_registry_writer_service_accounts)

  project = var.platform_project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${each.value}"

  depends_on = [google_project_service.apis]
}

resource "google_project_iam_member" "artifact_registry_writer_members" {
  for_each = toset(var.artifact_registry_writer_members)

  project = var.platform_project_id
  role    = "roles/artifactregistry.writer"
  member  = each.value

  depends_on = [google_project_service.apis]
}

resource "google_service_account" "workspace_terraform" {
  project      = var.platform_project_id
  account_id   = "workspace-terraform"
  display_name = "Workspace Terraform"
  description  = "Service account used by Terraform to manage Google Workspace users and groups."

  depends_on = [google_project_service.apis]
}

resource "google_service_account_iam_member" "workspace_terraform_token_creators" {
  for_each = toset(var.workspace_terraform_token_creator_members)

  service_account_id = google_service_account.workspace_terraform.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = each.value
}

resource "google_service_account_iam_member" "workspace_terraform_self_token_creator" {
  service_account_id = google_service_account.workspace_terraform.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.workspace_terraform.email}"
}
