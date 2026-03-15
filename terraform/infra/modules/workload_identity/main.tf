# GCP service account per service
resource "google_service_account" "service" {
  for_each = var.service_accounts

  account_id   = "${each.key}-sa"
  display_name = "${each.key}-sa"
  project      = var.gcp_project_id
}

# Project-level IAM roles for each service account
resource "google_project_iam_member" "roles" {
  for_each = {
    for pair in flatten([
      for name, sa in var.service_accounts : [
        for role in sa.roles : {
          key  = "${name}--${role}"
          name = name
          role = role
        }
      ]
    ]) : pair.key => pair
  }

  project = var.gcp_project_id
  role    = each.value.role
  member  = "serviceAccount:${google_service_account.service[each.value.name].email}"
}

# Secret Manager access for each service account
resource "google_secret_manager_secret_iam_member" "secret_access" {
  for_each = {
    for pair in flatten([
      for name, sa in var.service_accounts : [
        for secret in sa.gsm_secrets : {
          key    = "${name}--${secret}"
          name   = name
          secret = secret
        }
      ]
    ]) : pair.key => pair
  }

  project   = var.gcp_project_id
  secret_id = each.value.secret
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.service[each.value.name].email}"
}

# Kubernetes service account annotated with the GCP SA email
resource "kubernetes_service_account" "service" {
  for_each = var.service_accounts

  metadata {
    name      = each.key
    namespace = coalesce(each.value.k8s_namespace, var.k8s_namespace)

    annotations = {
      "iam.gke.io/gcp-service-account" = google_service_account.service[each.key].email
    }
  }
}

# Cloud SQL IAM database user — allows SA to authenticate to Postgres via IAM
resource "google_sql_user" "cloudsql_iam_user" {
  for_each = {
    for pair in flatten([
      for name, sa in var.service_accounts : [
        for instance in sa.cloudsql_instances : {
          key      = "${name}--${instance}"
          name     = name
          instance = instance
        }
      ]
    ]) : pair.key => pair
  }

  project  = var.gcp_project_id
  name     = google_service_account.service[each.value.name].email
  instance = var.cloudsql_instance_names[each.value.instance]
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

# Allow the K8s SA to impersonate the GCP SA via Workload Identity
resource "google_service_account_iam_member" "workload_identity" {
  for_each = var.service_accounts

  service_account_id = google_service_account.service[each.key].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.gcp_project_id}.svc.id.goog[${coalesce(each.value.k8s_namespace, var.k8s_namespace)}/${each.key}]"
}
