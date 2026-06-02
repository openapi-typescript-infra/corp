locals {
  is_development = var.environment == "development"

  name_prefix     = var.environment
  k8s_name_prefix = var.environment

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
