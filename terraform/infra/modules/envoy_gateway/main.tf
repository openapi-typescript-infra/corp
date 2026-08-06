terraform {
  required_providers {
    google = {
      source = "hashicorp/google"
    }
    helm = {
      source = "hashicorp/helm"
    }
    kubernetes = {
      source = "hashicorp/kubernetes"
    }
    kubectl = {
      source = "gavinbunney/kubectl"
    }
  }
}

locals {
  namespace              = "envoy-gateway-system"
  cert_manager_namespace = "cert-manager"
  gateway_class_name     = "envoy-gateway"
  gateway_name           = "${var.environment}-gateway"
  envoy_proxy_name       = "${var.environment}-envoy-proxy"
  public_tls_enabled     = var.public_tls_config.enabled

  envoy_gateway_crd_names = [
    "backendtlspolicies.gateway.networking.k8s.io",
    "gatewayclasses.gateway.networking.k8s.io",
    "gateways.gateway.networking.k8s.io",
    "grpcroutes.gateway.networking.k8s.io",
    "httproutes.gateway.networking.k8s.io",
    "referencegrants.gateway.networking.k8s.io",
    "tcproutes.gateway.networking.k8s.io",
    "tlsroutes.gateway.networking.k8s.io",
    "udproutes.gateway.networking.k8s.io",
    "xbackendtrafficpolicies.gateway.networking.x-k8s.io",
    "xlistenersets.gateway.networking.x-k8s.io",
    "xmeshes.gateway.networking.x-k8s.io",
    "backends.gateway.envoyproxy.io",
    "backendtrafficpolicies.gateway.envoyproxy.io",
    "clienttrafficpolicies.gateway.envoyproxy.io",
    "envoyextensionpolicies.gateway.envoyproxy.io",
    "envoypatchpolicies.gateway.envoyproxy.io",
    "envoyproxies.gateway.envoyproxy.io",
    "httproutefilters.gateway.envoyproxy.io",
    "securitypolicies.gateway.envoyproxy.io",
  ]

  envoy_gateway_crd_docs = {
    for doc in [
      for raw in split("\n---\n", data.helm_template.envoy_gateway_crds.manifest) :
      trimspace(raw) if length(trimspace(raw)) > 0
    ] :
    yamldecode(doc).metadata.name => doc
    if try(yamldecode(doc).kind, "") == "CustomResourceDefinition"
  }
}

resource "google_compute_address" "gateway" {
  name    = "${var.environment}-envoy-gateway-ip"
  project = var.gcp_project_id
  region  = var.gcp_region
}

resource "kubernetes_namespace" "envoy_gateway" {
  metadata {
    name = local.namespace
  }
}

resource "kubernetes_namespace" "cert_manager" {
  count = local.public_tls_enabled ? 1 : 0

  metadata {
    name = local.cert_manager_namespace
  }
}

resource "kubernetes_secret" "cloudflare_dns01" {
  count = local.public_tls_enabled ? 1 : 0

  metadata {
    name      = "cloudflare-dns01"
    namespace = kubernetes_namespace.envoy_gateway.metadata[0].name
  }

  type                           = "Opaque"
  wait_for_service_account_token = false

  data = {
    api-token = var.cloudflare_api_token
  }
}

resource "helm_release" "cert_manager" {
  count = local.public_tls_enabled ? 1 : 0

  name             = "cert-manager"
  repository       = "https://charts.jetstack.io"
  chart            = "cert-manager"
  version          = var.public_tls_config.cert_manager_version
  namespace        = kubernetes_namespace.cert_manager[0].metadata[0].name
  create_namespace = false
  timeout          = 600

  set {
    name  = "crds.enabled"
    value = "true"
  }

  depends_on = [kubernetes_namespace.cert_manager]
}

data "helm_template" "envoy_gateway_crds" {
  name             = "gateway-crds"
  repository       = "oci://docker.io/envoyproxy"
  chart            = "gateway-crds-helm"
  version          = var.envoy_gateway_config.chart_version
  namespace        = kubernetes_namespace.envoy_gateway.metadata[0].name
  include_crds     = true
  disable_webhooks = true

  set {
    name  = "crds.gatewayAPI.enabled"
    value = "true"
  }

  set {
    name  = "crds.envoyGateway.enabled"
    value = "true"
  }
}

resource "kubectl_manifest" "envoy_gateway_crd" {
  for_each          = toset(local.envoy_gateway_crd_names)
  yaml_body         = local.envoy_gateway_crd_docs[each.key]
  wait_for_rollout  = false
  server_side_apply = true
  force_conflicts   = true
}

resource "helm_release" "envoy_gateway" {
  name       = "envoy-gateway"
  repository = "oci://docker.io/envoyproxy"
  chart      = "gateway-helm"
  version    = var.envoy_gateway_config.chart_version
  namespace  = kubernetes_namespace.envoy_gateway.metadata[0].name
  skip_crds  = true
  timeout    = 600

  set {
    name  = "deployment.replicas"
    value = var.envoy_gateway_config.control_plane_replicas
  }

  set {
    name  = "deployment.envoyGateway.resources.requests.cpu"
    value = var.envoy_gateway_config.control_plane_cpu_request
  }

  depends_on = [kubectl_manifest.envoy_gateway_crd]
}

resource "kubectl_manifest" "gateway_class" {
  yaml_body = yamlencode({
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "GatewayClass"
    metadata = {
      name = local.gateway_class_name
    }
    spec = {
      controllerName = "gateway.envoyproxy.io/gatewayclass-controller"
    }
  })

  depends_on = [helm_release.envoy_gateway]
}

resource "kubectl_manifest" "envoy_proxy" {
  yaml_body = yamlencode({
    apiVersion = "gateway.envoyproxy.io/v1alpha1"
    kind       = "EnvoyProxy"
    metadata = {
      name      = local.envoy_proxy_name
      namespace = local.namespace
    }
    spec = {
      provider = {
        type = "Kubernetes"
        kubernetes = {
          envoyService = {
            type           = "LoadBalancer"
            loadBalancerIP = google_compute_address.gateway.address
          }
        }
      }
    }
  })

  depends_on = [helm_release.envoy_gateway]
}

resource "kubectl_manifest" "gateway" {
  yaml_body = yamlencode({
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "Gateway"
    metadata = {
      name      = local.gateway_name
      namespace = local.namespace
    }
    spec = {
      gatewayClassName = local.gateway_class_name
      infrastructure = {
        parametersRef = {
          group = "gateway.envoyproxy.io"
          kind  = "EnvoyProxy"
          name  = local.envoy_proxy_name
        }
      }
      listeners = concat([
        {
          name     = "http"
          protocol = "HTTP"
          port     = 80
          allowedRoutes = {
            namespaces = {
              from = "All"
            }
          }
        }
        ],
        local.public_tls_enabled ? [
          {
            name     = "https"
            protocol = "HTTPS"
            port     = 443
            tls = {
              mode = "Terminate"
              certificateRefs = [
                {
                  name = var.public_tls_config.certificate_secret_name
                }
              ]
            }
            allowedRoutes = {
              namespaces = {
                from = "All"
              }
            }
          }
        ] : []
      )
    }
  })

  depends_on = [
    kubectl_manifest.envoy_proxy,
    kubectl_manifest.gateway_class,
    kubectl_manifest.public_tls_certificate,
  ]
}

resource "kubectl_manifest" "public_tls_issuer" {
  count = local.public_tls_enabled ? 1 : 0

  yaml_body = yamlencode({
    apiVersion = "cert-manager.io/v1"
    kind       = "Issuer"
    metadata = {
      name      = "letsencrypt-dns01"
      namespace = kubernetes_namespace.envoy_gateway.metadata[0].name
    }
    spec = {
      acme = {
        email  = var.public_tls_config.acme_email
        server = var.public_tls_config.acme_server
        privateKeySecretRef = {
          name = "letsencrypt-dns01-account-key"
        }
        solvers = [
          {
            dns01 = {
              cloudflare = {
                apiTokenSecretRef = {
                  name = kubernetes_secret.cloudflare_dns01[0].metadata[0].name
                  key  = "api-token"
                }
              }
            }
          }
        ]
      }
    }
  })

  depends_on = [
    helm_release.cert_manager,
    kubernetes_secret.cloudflare_dns01,
  ]
}

resource "kubectl_manifest" "public_tls_certificate" {
  count = local.public_tls_enabled ? 1 : 0

  yaml_body = yamlencode({
    apiVersion = "cert-manager.io/v1"
    kind       = "Certificate"
    metadata = {
      name      = "gateway-public-tls"
      namespace = kubernetes_namespace.envoy_gateway.metadata[0].name
    }
    spec = {
      secretName = var.public_tls_config.certificate_secret_name
      issuerRef = {
        name = "letsencrypt-dns01"
        kind = "Issuer"
      }
      dnsNames = var.public_tls_config.dns_names
    }
  })

  depends_on = [kubectl_manifest.public_tls_issuer]
}
