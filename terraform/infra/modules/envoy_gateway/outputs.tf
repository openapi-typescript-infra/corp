output "gateway_ip" {
  description = "Static IP address for the Envoy Gateway load balancer"
  value       = google_compute_address.gateway.address
}

output "gateway_ip_name" {
  description = "GCP resource name for the static IP (use in Gateway manifest annotations)"
  value       = google_compute_address.gateway.name
}

output "example_gateway_yaml" {
  description = "Example Kubernetes manifests for Gateway, HTTPRoute, ExtAuth, header security, and OTel"
  value       = <<-YAML
    # Apply these manifests to your GKE cluster after terraform apply.
    # They are NOT managed by Terraform — edit them alongside your app deployments.
    #
    # ──────────────────────────────────────────────────────────────────
    # SECURITY MODEL
    #
    #   External request
    #     → Cloudflare blocks any request carrying x-auth-token (WAF rule)
    #     → Envoy RBAC filter rejects x-auth-token (defense-in-depth)
    #     → Envoy ExtAuth calls authn-authz-internal at /envoy/<path>
    #     → Auth service returns x-auth-token for downstream services
    #     → Backend receives trusted x-auth-token
    #
    #   x-auth-token MUST NEVER be accepted from outside. It is set
    #   exclusively by authn-authz-internal via ExtAuth.
    # ──────────────────────────────────────────────────────────────────
    #
    # 1. Gateway — binds to the static IP provisioned by Terraform
    ---
    apiVersion: gateway.networking.k8s.io/v1
    kind: Gateway
    metadata:
      name: ${var.environment}-gateway
      namespace: envoy-gateway-system
      annotations:
        networking.gke.io/load-balancer-ip-addresses: ${google_compute_address.gateway.name}
    spec:
      gatewayClassName: envoy-gateway
      listeners:
        - name: http
          protocol: HTTP
          port: 80
        # Add HTTPS listener with a TLS cert:
        # - name: https
        #   protocol: HTTPS
        #   port: 443
        #   tls:
        #     mode: Terminate
        #     certificateRefs:
        #       - name: your-tls-secret
    #
    # 2. HTTPRoute — route traffic to a backend service
    ---
    apiVersion: gateway.networking.k8s.io/v1
    kind: HTTPRoute
    metadata:
      name: example-route
      namespace: hs
    spec:
      parentRefs:
        - name: ${var.environment}-gateway
          namespace: envoy-gateway-system
      rules:
        - matches:
            - path:
                type: PathPrefix
                value: /api
          backendRefs:
            - name: your-backend-service
              port: 8080
    #
    # 3. EnvoyPatchPolicy — reject x-auth-token from external requests
    #
    #    This RBAC filter is inserted at position 0 in the HTTP filter
    #    chain, BEFORE ext_authz. Any request arriving with x-auth-token
    #    already set is rejected with 403. After this filter passes,
    #    ext_authz (SecurityPolicy below) calls the auth service which
    #    is the ONLY thing allowed to set x-auth-token.
    #
    #    This is defense-in-depth — Cloudflare also blocks x-auth-token
    #    at the edge, but this protects against direct-IP access.
    ---
    apiVersion: gateway.envoyproxy.io/v1alpha1
    kind: EnvoyPatchPolicy
    metadata:
      name: block-internal-headers
      namespace: envoy-gateway-system
    spec:
      targetRef:
        group: gateway.networking.k8s.io
        kind: Gateway
        name: ${var.environment}-gateway
      type: JSONPatch
      jsonPatches:
        - type: "type.googleapis.com/envoy.config.listener.v3.Listener"
          name: "envoy-gateway-system/${var.environment}-gateway/http"
          operation:
            op: add
            # Insert at position 0 → runs before ext_authz and router
            path: "/default_filter_chain/filters/0/typed_config/http_filters/0"
            value:
              name: envoy.filters.http.rbac
              typed_config:
                "@type": "type.googleapis.com/envoy.extensions.filters.http.rbac.v3.RBAC"
                rules:
                  action: DENY
                  policies:
                    block-spoofed-auth-token:
                      permissions:
                        - header:
                            name: "x-auth-token"
                            present_match: true
                      principals:
                        - any: true
    #
    # 4. SecurityPolicy — ExtAuth via authn-authz-internal
    #
    #    Envoy sends every request to the auth service over HTTP.
    #    The auth check URL is: http://authn-authz-internal:<port>/envoy/<original-path>
    #    The auth service inspects inbound headers (Authorization, Cookie, etc.)
    #    and returns x-auth-token in its response headers, which Envoy adds
    #    to the upstream request before forwarding to the backend.
    ---
    apiVersion: gateway.envoyproxy.io/v1alpha1
    kind: SecurityPolicy
    metadata:
      name: ext-auth
      namespace: envoy-gateway-system
    spec:
      targetRefs:
        - group: gateway.networking.k8s.io
          kind: Gateway
          name: ${var.environment}-gateway
      extAuth:
        http:
          backendRef:
            name: authn-authz-internal
            namespace: hs
            port: 80
          path: /envoy
          headersToBackend:
            - Authorization
            - Cookie
    #
    # 5. EnvoyProxy — OpenTelemetry (add after deploying your OTel collector)
    # ---
    # apiVersion: gateway.envoyproxy.io/v1alpha1
    # kind: EnvoyProxy
    # metadata:
    #   name: otel-config
    #   namespace: envoy-gateway-system
    # spec:
    #   telemetry:
    #     tracing:
    #       provider:
    #         backendRefs:
    #           - name: otel-collector
    #             namespace: observability
    #             port: 4317
  YAML
}
