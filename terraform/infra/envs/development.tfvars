environment = "development"

gcp_project_id = "justtellme-dev"
gcp_region     = "us-central1"
gcp_zone       = "us-central1-a"

gke_config = {
  node_count   = 1
  machine_type = "e2-medium"
  disk_size_gb = 50
}

postgres_instances = {
  pg-main = {
    tier      = "db-f1-micro"
    databases = ["identity", "payment"]
  }
}

secrets = [
  "session_secret",
  "stytch_project_id",
  "stytch_secret",
]

pubsub_topics = {
  individual_created = {
    subscriptions = ["crm-sync-internal"]
  }
}

cloudflare_zone_id = "1ab92e0aa6efb0e7e00594eaa800530f"

cloudflare_dns_records = {
  api = {
    name = "api.development"
  }
  app = {
    name = "app.development"
  }
}

envoy_gateway_config = {}

cloudflare_waf_enabled = false
