terraform {
  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
    }
  }
}

# --- DNS records ---

resource "cloudflare_record" "records" {
  for_each = var.dns_records

  zone_id = var.cloudflare_zone_id
  name    = each.value.name
  content = each.value.content != null ? each.value.content : var.origin_ip
  type    = each.value.type
  proxied = each.value.proxied
  ttl     = each.value.proxied ? 1 : 300
}

# --- SSL/TLS settings ---

resource "cloudflare_zone_settings_override" "settings" {
  zone_id = var.cloudflare_zone_id

  settings {
    ssl                      = "strict"
    always_use_https         = "on"
    min_tls_version          = "1.2"
    automatic_https_rewrites = "on"
  }
}

# --- Block internal headers from external requests ---
#
# x-auth-token is set exclusively by the internal authn-authz-internal service
# via Envoy ExtAuth. Accepting it from outside would let an attacker forge
# identity. This rule rejects such requests at the edge before they reach the
# origin.  Envoy also enforces this independently (defense-in-depth).

resource "cloudflare_ruleset" "block_internal_headers" {
  zone_id = var.cloudflare_zone_id
  name    = "${var.environment}-block-internal-headers"
  kind    = "zone"
  phase   = "http_request_firewall_custom"

  rules {
    action      = "block"
    expression  = "any(http.request.headers.names[*] == \"x-auth-token\")"
    description = "Block requests carrying the internal x-auth-token header"
    enabled     = true
  }
}

# --- WAF (production gets stricter rules) ---

resource "cloudflare_ruleset" "waf" {
  count = var.waf_enabled ? 1 : 0

  zone_id = var.cloudflare_zone_id
  name    = "${var.environment}-waf-custom-rules"
  kind    = "zone"
  phase   = "http_ratelimit"

  rules {
    action      = "block"
    expression  = "(http.request.uri.path contains \"/api/\" and rate.limit gt ${var.waf_rate_limit_rps})"
    description = "${var.environment} API rate limit"
    ratelimit {
      characteristics     = ["ip.src"]
      period              = 60
      requests_per_period = var.waf_rate_limit_rps
      mitigation_timeout  = 600
    }
  }
}
