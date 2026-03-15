output "instance_names" {
  description = "Map of logical instance key to Cloud SQL instance name"
  value = {
    for key, instance in google_sql_database_instance.instances : key => instance.name
  }
}

output "connection_info" {
  description = "Postgres connection info per instance"
  value = {
    for key, instance in google_sql_database_instance.instances : key => {
      host      = instance.private_ip_address
      port      = 5432
      username  = google_sql_user.users[key].name
      password  = random_password.db_passwords[key].result
      databases = var.postgres_instances[key].databases
    }
  }
  sensitive = true
}
