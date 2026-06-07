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
  "stytch_public_key",
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

stytch_project = {
  name         = "Just Tell Me Development"
  project_slug = "justtellme-development"
}

stytch_environment = {
  name             = "Development"
  environment_slug = "development"
}

stytch_redirect_urls = {
  consumer_web_authenticate_return_url = {
    url = "https://consumer.dev.justtellme.com/authenticate?return_url={}"
    valid_types = [
      {
        type = "LOGIN"
      },
      {
        type = "SIGNUP"
      },
    ]
  }
  local_consumer_web_authenticate_return_url = {
    url = "https://consumer.local.dev.justtellme.com/authenticate?return_url={}"
    valid_types = [
      {
        type = "LOGIN"
      },
      {
        type = "SIGNUP"
      },
    ]
  }
}
