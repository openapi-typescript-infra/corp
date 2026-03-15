output "secret_names" {
  description = "Map of logical secret name to Secret Manager secret ID"
  value = {
    for name in var.secrets : name => google_secret_manager_secret.secrets[name].secret_id
  }
}
