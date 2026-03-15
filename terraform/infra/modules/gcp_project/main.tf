resource "google_project_service" "apis" {
  for_each = toset(var.gcp_apis)

  project = var.gcp_project_id
  service = each.value

  disable_on_destroy = false
}
