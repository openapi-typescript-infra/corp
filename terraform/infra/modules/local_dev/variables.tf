variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "postgres_instances" {
  description = "Map of Postgres instance configurations"
  type = map(object({
    tier      = optional(string)
    databases = list(string)
  }))
}

variable "base_port" {
  description = "Base host port for Postgres containers (incremented per instance)"
  type        = number
  default     = 5432
}
