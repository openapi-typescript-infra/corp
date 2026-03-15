output "service_account_emails" {
  description = "Map of service name to GCP service account email"
  value = {
    for name, sa in google_service_account.service : name => sa.email
  }
}
