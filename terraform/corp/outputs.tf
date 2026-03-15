output "groups" {
  description = "Map of managed Google Workspace groups"
  value = {
    for key, group in googleworkspace_group.groups : key => {
      email = group.email
      name  = group.name
      id    = group.id
    }
  }
}

output "users" {
  description = "Map of managed Google Workspace users"
  value = {
    for key, user in googleworkspace_user.users : key => {
      email     = user.primary_email
      suspended = user.suspended
    }
  }
}
