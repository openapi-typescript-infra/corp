provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
  zone    = var.gcp_zone
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# --- Kubernetes and Helm providers (GKE-backed) ---

data "google_client_config" "default" {}

provider "kubernetes" {
  host                   = "https://${module.gke.cluster_endpoint}"
  token                  = data.google_client_config.default.access_token
  cluster_ca_certificate = base64decode(module.gke.cluster_ca_certificate)
}

provider "helm" {
  kubernetes {
    host                   = "https://${module.gke.cluster_endpoint}"
    token                  = data.google_client_config.default.access_token
    cluster_ca_certificate = base64decode(module.gke.cluster_ca_certificate)
  }
}

# --- Always-on modules (all environments) ---

module "gcp_project" {
  source = "./modules/gcp_project"

  gcp_project_id = var.gcp_project_id
  gcp_apis       = local.gcp_apis
}

module "secrets" {
  source = "./modules/secrets"

  gcp_project_id = var.gcp_project_id
  environment    = var.environment
  secrets        = var.secrets

  depends_on = [module.gcp_project]
}

module "pubsub" {
  source = "./modules/pubsub"

  gcp_project_id = var.gcp_project_id
  environment    = var.environment
  pubsub_topics  = var.pubsub_topics

  depends_on = [module.gcp_project]
}

# --- Artifact Registry repositories ---

resource "google_artifact_registry_repository" "npm_packages" {
  repository_id = "npm-packages"
  location      = var.gcp_region
  format        = "NPM"
  description   = "npm package registry for ${var.environment}"

  depends_on = [module.gcp_project]
}

resource "google_artifact_registry_repository" "docker_images" {
  repository_id = "docker-images"
  location      = var.gcp_region
  format        = "DOCKER"
  description   = "Docker image registry for ${var.environment}"

  depends_on = [module.gcp_project]
}

module "github_wif" {
  source = "./modules/github_wif"

  gcp_project_id = var.gcp_project_id
  github_repo    = var.github_repo

  depends_on = [module.gcp_project]
}

# --- Cloud infrastructure modules ---

module "networking" {
  source = "./modules/networking"

  gcp_project_id = var.gcp_project_id
  gcp_region     = var.gcp_region
  environment    = var.environment

  depends_on = [module.gcp_project]
}

module "gke" {
  source = "./modules/gke"

  gcp_project_id = var.gcp_project_id
  gcp_region     = var.gcp_region
  gcp_zone       = var.gcp_zone
  environment    = var.environment
  suspended      = var.suspended
  gke_config     = var.gke_config
  network_id     = module.networking.network_id
  subnet_id      = module.networking.subnet_id

  depends_on = [module.networking]
}

module "workload_identity" {
  source = "./modules/workload_identity"

  gcp_project_id          = var.gcp_project_id
  service_accounts        = local.service_accounts
  cloudsql_instance_names = module.cloud_sql.instance_names

  depends_on = [module.gke, module.cloud_sql]
}

module "envoy_gateway" {
  source = "./modules/envoy_gateway"

  gcp_project_id       = var.gcp_project_id
  gcp_region           = var.gcp_region
  environment          = var.environment
  envoy_gateway_config = var.envoy_gateway_config

  depends_on = [module.gke]
}

module "cloud_sql" {
  source = "./modules/cloud_sql"

  gcp_project_id     = var.gcp_project_id
  gcp_region         = var.gcp_region
  environment        = var.environment
  suspended          = var.suspended
  postgres_instances = var.postgres_instances
  network_id         = module.networking.network_id

  depends_on = [module.networking]
}

module "cloudflare" {
  source = "./modules/cloudflare"

  environment        = var.environment
  cloudflare_zone_id = var.cloudflare_zone_id
  origin_ip          = module.envoy_gateway.gateway_ip
  dns_records        = var.cloudflare_dns_records
  waf_enabled        = var.cloudflare_waf_enabled
  waf_rate_limit_rps = var.cloudflare_waf_rate_limit_rps

  depends_on = [module.envoy_gateway]
}

# --- Developer access (development only) ---

resource "google_project_iam_member" "dev_secret_accessor" {
  count   = local.is_development ? 1 : 0
  project = var.gcp_project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "group:developers@justtellme.live"
}
