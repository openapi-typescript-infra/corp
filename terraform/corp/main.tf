terraform {
  required_version = ">= 1.5"

  required_providers {
    googleworkspace = {
      source  = "hashicorp/googleworkspace"
      version = "~> 0.7"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0"
    }
  }

  backend "gcs" {}
}

provider "googleworkspace" {
  customer_id             = var.workspace_customer_id
  credentials             = fileexists("${path.module}/terraform-service-account.json") ? file("${path.module}/terraform-service-account.json") : null
  impersonated_user_email = var.workspace_admin_email
  oauth_scopes = [
    "https://www.googleapis.com/auth/admin.directory.group",
    "https://www.googleapis.com/auth/admin.directory.group.member",
    "https://www.googleapis.com/auth/admin.directory.user",
  ]
}
