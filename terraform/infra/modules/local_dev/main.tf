terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

resource "docker_image" "postgres" {
  name = "postgres:18"
}

resource "docker_container" "postgres" {
  for_each = var.postgres_instances

  name  = "${var.environment}-postgres-${each.key}"
  image = docker_image.postgres.image_id

  ports {
    internal = 5432
    external = var.base_port + index(keys(var.postgres_instances), each.key)
  }

  env = [
    "POSTGRES_USER=${var.environment}_${each.key}",
    "POSTGRES_PASSWORD=local_dev_password",
    "POSTGRES_DB=${each.value.databases[0]}",
  ]

  restart = "unless-stopped"

  provisioner "local-exec" {
    command = <<-EOT
      sleep 3
      %{for db in slice(each.value.databases, 1, length(each.value.databases))}
      docker exec ${var.environment}-postgres-${each.key} createdb -U ${var.environment}_${each.key} ${db} 2>/dev/null || true
      %{endfor}
    EOT
  }
}
