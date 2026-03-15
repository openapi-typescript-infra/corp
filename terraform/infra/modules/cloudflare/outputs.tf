output "dns_record_hostnames" {
  description = "Map of record key to FQDN"
  value = {
    for key, record in cloudflare_record.records : key => record.hostname
  }
}

output "zone_id" {
  description = "Cloudflare zone ID (passthrough for downstream use)"
  value       = var.cloudflare_zone_id
}
