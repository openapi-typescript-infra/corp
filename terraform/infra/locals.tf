locals {
  is_development = var.environment == "development"

  name_prefix     = var.environment
  k8s_name_prefix = var.environment

  # Service accounts that need GCP IAM identities via Workload Identity.
  # These are environment-independent — every environment gets the same set.
  service_accounts = {
    identity-internal = {
      roles = [
        "roles/cloudsql.client",
        "roles/cloudsql.instanceUser",
      ]
      cloudsql_instances = ["pg-main"]
    }
  }

  gcp_apis = [
    "secretmanager.googleapis.com",
    "pubsub.googleapis.com",
    "storage.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "container.googleapis.com",
    "sqladmin.googleapis.com",
    "servicenetworking.googleapis.com",
    "compute.googleapis.com",
  ]
}
