locals {
  has_cloudsql = length(var.cloudsql_instances) > 0
}

resource "google_service_account" "service" {
  account_id   = "${var.service}-sa"
  display_name = "${var.service}-sa"
  project      = var.gcp_project_id
}

resource "kubernetes_service_account" "service" {
  metadata {
    name      = "${var.service}-sa"
    namespace = var.k8s_namespace

    annotations = {
      "iam.gke.io/gcp-service-account" = google_service_account.service.email
    }
  }
}

resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = google_service_account.service.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.gcp_project_id}.svc.id.goog[${var.k8s_namespace}/${kubernetes_service_account.service.metadata[0].name}]"
}

resource "google_project_iam_member" "extra_roles" {
  for_each = var.extra_project_roles

  project = var.gcp_project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.service.email}"
}

resource "google_secret_manager_secret_iam_member" "secret_access" {
  for_each = var.secret_accessor_secrets

  project   = var.gcp_project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.service.email}"
}

resource "google_project_iam_member" "cloudsql_client" {
  count = local.has_cloudsql ? 1 : 0

  project = var.gcp_project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.service.email}"
}

resource "google_project_iam_member" "cloudsql_instance_user" {
  count = local.has_cloudsql ? 1 : 0

  project = var.gcp_project_id
  role    = "roles/cloudsql.instanceUser"
  member  = "serviceAccount:${google_service_account.service.email}"
}

resource "google_sql_user" "cloudsql_iam_user" {
  for_each = var.cloudsql_instances

  project  = var.gcp_project_id
  name     = trimsuffix(google_service_account.service.email, ".gserviceaccount.com")
  instance = var.cloudsql_instance_names[each.value]
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}
