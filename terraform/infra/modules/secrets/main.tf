resource "google_secret_manager_secret" "secrets" {
  for_each = toset(var.secrets)

  secret_id = each.value
  project   = var.gcp_project_id

  replication {
    auto {}
  }
}
