locals {
  # Load all YAML files from the users/ directory
  user_files = fileset(path.module, "users/*.yaml")
  user_definitions = {
    for f in local.user_files :
    trimsuffix(basename(f), ".yaml") => yamldecode(file("${path.module}/${f}"))
  }
}

resource "random_password" "user_initial_passwords" {
  for_each = local.user_definitions
  length   = 32
  special  = true
}

resource "googleworkspace_user" "users" {
  for_each = local.user_definitions

  primary_email                 = each.value.email
  password                      = random_password.user_initial_passwords[each.key].result
  change_password_at_next_login = true
  # status can be: "active" (default), "suspended", or "archived"
  # archived users are also marked suspended to match Google Workspace behavior
  suspended = contains(["suspended", "archived"], lookup(each.value, "status", "active"))
  archived  = lookup(each.value, "status", "active") == "archived"

  name {
    given_name  = each.value.given_name
    family_name = each.value.family_name
  }

  lifecycle {
    ignore_changes = [
      password,
      change_password_at_next_login,
      recovery_email,
      recovery_phone,
      org_unit_path,
      name,
      aliases,
      emails,
      locations,
      phones,
      organizations,
      timeouts,
    ]
  }
}
