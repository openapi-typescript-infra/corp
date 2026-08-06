locals {
  is_development     = var.environment == "development"
  datastream_enabled = try(var.datastream_config.enabled, false)
  datastream_sources = local.datastream_enabled ? var.datastream_config.sources : {}
  monitoring_enabled = var.monitoring_config.enabled

  name_prefix     = var.environment
  k8s_name_prefix = var.environment

  gcp_apis = concat([
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
    ], local.monitoring_enabled ? [
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    ] : [], local.datastream_enabled ? [
    "bigquery.googleapis.com",
    "bigquerystorage.googleapis.com",
    "datastream.googleapis.com",
    "networkconnectivity.googleapis.com",
  ] : [])
}
