locals {
  # Load all YAML files from the groups/ directory
  group_files = fileset(path.module, "groups/*.yaml")
  group_definitions = {
    for f in local.group_files :
    trimsuffix(basename(f), ".yaml") => yamldecode(file("${path.module}/${f}"))
  }

  # Flatten group memberships into a map for for_each
  memberships = merge([
    for group_key, group in local.group_definitions : {
      for member in group.members :
      "${group_key}/${member.email}" => {
        group_key = group_key
        group_id  = googleworkspace_group.groups[group_key].id
        email     = member.email
        role      = upper(lookup(member, "role", "MEMBER"))
        type      = upper(lookup(member, "type", "USER"))
      }
    }
  ]...)
}

resource "googleworkspace_group" "groups" {
  for_each = local.group_definitions

  email       = each.value.email
  name        = each.value.name
  description = lookup(each.value, "description", "")
}

resource "googleworkspace_group_member" "memberships" {
  for_each = local.memberships

  group_id = each.value.group_id
  email    = each.value.email
  role     = each.value.role
  type     = each.value.type
}
