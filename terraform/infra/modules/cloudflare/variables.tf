variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID"
  type        = string
}

variable "origin_ip" {
  description = "Default origin IP (GKE ingress) used when a DNS record omits content"
  type        = string
}

variable "dns_records" {
  description = "Map of DNS records to create"
  type = map(object({
    name    = string
    type    = optional(string, "A")
    content = optional(string)
    proxied = optional(bool, true)
  }))
}

variable "waf_enabled" {
  description = "Enable WAF rate limiting rules"
  type        = bool
  default     = false
}

variable "waf_rate_limit_rps" {
  description = "Requests per minute before rate limiting kicks in"
  type        = number
  default     = 1000
}
