locals {
  stytch_managed_project = var.stytch_project != null
  stytch_managed_test_environment = (
    local.stytch_managed_project &&
    try(var.stytch_environment.type, null) == "TEST"
  )
  stytch_managed_live_environment = (
    local.stytch_managed_project &&
    try(var.stytch_project.live_environment, null) != null &&
    (
      var.stytch_environment == null ||
      try(var.stytch_environment.environment_slug, null) == try(var.stytch_project.live_environment.environment_slug, null)
    )
  )

  stytch_project_slug = local.stytch_managed_project ? stytch_project.project[0].project_slug : var.stytch_project_slug
  stytch_environment_slug = (
    local.stytch_managed_test_environment
    ? stytch_environment.environment[0].environment_slug
    : (
      var.stytch_environment != null
      ? var.stytch_environment.environment_slug
      : var.stytch_environment_slug
    )
  )

  stytch_enabled       = local.stytch_project_slug != "" && local.stytch_environment_slug != ""
  stytch_redirect_urls = local.stytch_enabled ? var.stytch_redirect_urls : {}
  stytch_project_id = (
    local.stytch_managed_test_environment
    ? try(stytch_environment.environment[0].project_id, "")
    : (
      local.stytch_managed_live_environment
      ? try(stytch_project.project[0].live_environment.project_id, "")
      : ""
    )
  )
}

resource "stytch_project" "project" {
  count = local.stytch_managed_project ? 1 : 0

  name             = local.stytch_managed_project ? var.stytch_project.name : null
  vertical         = local.stytch_managed_project ? var.stytch_project.vertical : null
  project_slug     = local.stytch_managed_project ? var.stytch_project.project_slug : null
  live_environment = try(var.stytch_project.live_environment, null)
}

resource "stytch_environment" "environment" {
  count = local.stytch_managed_test_environment ? 1 : 0

  project_slug     = local.stytch_managed_project ? stytch_project.project[0].project_slug : null
  name             = local.stytch_managed_test_environment ? var.stytch_environment.name : null
  environment_slug = local.stytch_managed_test_environment ? var.stytch_environment.environment_slug : null
}

resource "stytch_public_token" "sdk" {
  count = local.stytch_enabled ? 1 : 0

  project_slug     = local.stytch_project_slug
  environment_slug = local.stytch_environment_slug
}

resource "stytch_secret" "api" {
  count = local.stytch_enabled ? 1 : 0

  project_slug     = local.stytch_project_slug
  environment_slug = local.stytch_environment_slug
}

resource "stytch_redirect_url" "redirect_urls" {
  for_each = local.stytch_redirect_urls

  project_slug     = local.stytch_project_slug
  environment_slug = local.stytch_environment_slug
  url              = each.value.url

  valid_types = [
    for valid_type in each.value.valid_types : {
      type       = valid_type.type
      is_default = valid_type.is_default
    }
  ]
}

resource "google_secret_manager_secret_version" "stytch_project_id" {
  count = local.stytch_project_id != "" && contains(var.secrets, "stytch_project_id") ? 1 : 0

  secret      = "projects/${var.gcp_project_id}/secrets/${module.secrets.secret_names["stytch_project_id"]}"
  secret_data = local.stytch_project_id
}

resource "google_secret_manager_secret_version" "stytch_public_key" {
  count = local.stytch_enabled && contains(var.secrets, "stytch_public_key") ? 1 : 0

  secret      = "projects/${var.gcp_project_id}/secrets/${module.secrets.secret_names["stytch_public_key"]}"
  secret_data = stytch_public_token.sdk[0].public_token
}

resource "google_secret_manager_secret_version" "stytch_secret" {
  count = local.stytch_enabled && contains(var.secrets, "stytch_secret") ? 1 : 0

  secret      = "projects/${var.gcp_project_id}/secrets/${module.secrets.secret_names["stytch_secret"]}"
  secret_data = stytch_secret.api[0].secret
}
