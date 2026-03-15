variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "pubsub_topics" {
  description = "Map of topic names to subscription configurations"
  type = map(object({
    subscriptions = list(string)
  }))
}
