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
    #     → Cloudflare blocks any request carrying x-auth-token (defense in
    #       depth for proxied/production traffic)
    #     → The managed ClientTrafficPolicy removes x-auth-token at the Envoy
    #       listener before routing or ExtAuth in every environment
    #     → Envoy ExtAuth calls authn-authz-internal at /envoy/<path>,
    #       forwarding only public authentication credentials
    #     → The auth service returns a freshly minted x-auth-token, which
    #       Envoy injects after the early removal step
    #     → Backend receives trusted x-auth-token
    #
    #   x-auth-token MUST NEVER be accepted from outside. It is set
    #   exclusively by authn-authz-internal via ExtAuth. The listener-level
    #   removal is the authoritative boundary; Cloudflare and auth-service
    #   rejection remain defense in depth.
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
    # 3. SecurityPolicy — ExtAuth via authn-authz-internal
    #
    #    Envoy sends every request to the auth service over HTTP at
    #    http://authn-authz-internal:<port>/envoy/<original-path>, forwarding
    #    the public credential headers. The auth service validates
    #    Authorization/Cookie and returns a freshly minted x-auth-token in its
    #    response headers, which Envoy adds to the upstream request
    #    (headersToBackend) before forwarding.
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
          backendRefs:
            - name: authn-authz-internal
              namespace: hs
              port: 80
          path: /envoy
          headersToExtAuth:
            - Authorization
            - Cookie
          headersToBackend:
            - x-auth-token
    #
    # 4. EnvoyProxy — OpenTelemetry (add after deploying your OTel collector)
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
