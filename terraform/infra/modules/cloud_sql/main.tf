resource "google_sql_database_instance" "instances" {
  for_each = var.postgres_instances

  name             = "${var.environment}-${each.key}"
  project          = var.gcp_project_id
  region           = var.gcp_region
  database_version = "POSTGRES_18"

  settings {
    tier              = each.value.tier
    activation_policy = var.suspended ? "NEVER" : each.value.activation_policy

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = var.network_id
      enable_private_path_for_google_cloud_services = true
    }
  }

  deletion_protection = false
}

resource "google_sql_database" "databases" {
  for_each = {
    for item in flatten([
      for instance_key, instance in var.postgres_instances : [
        for db in instance.databases : {
          key           = "${instance_key}_${db}"
          instance_key  = instance_key
          database_name = db
        }
      ]
    ]) : item.key => item
  }

  name     = each.value.database_name
  project  = var.gcp_project_id
  instance = google_sql_database_instance.instances[each.value.instance_key].name
}

resource "google_sql_user" "users" {
  for_each = var.postgres_instances

  name     = "${var.environment}_${each.key}"
  project  = var.gcp_project_id
  instance = google_sql_database_instance.instances[each.key].name
  password = random_password.db_passwords[each.key].result
}

resource "random_password" "db_passwords" {
  for_each = var.postgres_instances

  length  = 32
  special = false
}
