environment = "production"

gcp_project_id = "justtellme-prod"
gcp_region     = "us-central1"
gcp_zone       = "us-central1-a"

gke_config = {
  node_count   = 3
  machine_type = "e2-standard-4"
  disk_size_gb = 100
}

postgres_instances = {
  pg-main = {
    tier      = "db-custom-2-7680"
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
    name = "api"
  }
  app = {
    name = "app"
  }
}

envoy_gateway_config = {
  control_plane_replicas = 3
}

cloudflare_waf_enabled        = true
cloudflare_waf_rate_limit_rps = 500
