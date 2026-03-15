output "workload_identity_provider" {
  description = "Full resource name of the WIF provider (for use in google-github-actions/auth)"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "service_account_email" {
  description = "Email of the GitHub Actions CI service account"
  value       = google_service_account.github_actions.email
}
