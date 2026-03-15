resource "google_compute_address" "gateway" {
  name    = "${var.environment}-envoy-gateway-ip"
  project = var.gcp_project_id
  region  = var.gcp_region
}

resource "helm_release" "envoy_gateway_crds" {
  name             = "gateway-crds"
  repository       = "oci://docker.io/envoyproxy"
  chart            = "gateway-crds-helm"
  version          = var.envoy_gateway_config.chart_version
  namespace        = "envoy-gateway-system"
  create_namespace = true
}

resource "helm_release" "envoy_gateway" {
  name       = "envoy-gateway"
  repository = "oci://docker.io/envoyproxy"
  chart      = "gateway-helm"
  version    = var.envoy_gateway_config.chart_version
  namespace  = "envoy-gateway-system"
  skip_crds  = true

  set {
    name  = "deployment.replicas"
    value = var.envoy_gateway_config.control_plane_replicas
  }

  depends_on = [helm_release.envoy_gateway_crds]
}
