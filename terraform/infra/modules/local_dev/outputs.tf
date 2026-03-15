output "connection_info" {
  description = "Postgres connection info per instance (same shape as cloud_sql)"
  value = {
    for key, instance in var.postgres_instances : key => {
      host      = "localhost"
      port      = var.base_port + index(keys(var.postgres_instances), key)
      username  = "${var.environment}_${key}"
      password  = "local_dev_password"
      databases = instance.databases
    }
  }
}
