locals {
  monitoring_uptime_targets = local.monitoring_enabled ? var.monitoring_config.uptime_targets : {}
  monitoring_workload_filter = join(" OR ", [
    for name in var.monitoring_config.workload_names :
    "resource.labels.container_name=\"${name}\""
  ])
  monitoring_workload_alerts_enabled = local.monitoring_enabled && length(var.monitoring_config.workload_names) > 0
}

resource "google_monitoring_notification_channel" "operations_email" {
  count = local.monitoring_enabled && var.monitoring_config.notification_email != null ? 1 : 0

  project      = var.gcp_project_id
  display_name = "${title(var.environment)} operations email"
  type         = "email"

  labels = {
    email_address = var.monitoring_config.notification_email
  }

  depends_on = [module.gcp_project]
}

resource "google_monitoring_uptime_check_config" "public" {
  for_each = local.monitoring_uptime_targets

  project      = var.gcp_project_id
  display_name = "${title(var.environment)} ${each.key} HTTPS"
  period       = var.monitoring_config.uptime_period
  timeout      = var.monitoring_config.uptime_timeout
  checker_type = "STATIC_IP_CHECKERS"

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.gcp_project_id
      host       = module.cloudflare.dns_record_hostnames[each.value.dns_record_key]
    }
  }

  http_check {
    path                = each.value.path
    port                = 443
    request_method      = each.value.request_method
    content_type        = each.value.content_type
    custom_content_type = each.value.custom_content_type
    body                = each.value.body == null ? null : base64encode(each.value.body)
    use_ssl             = true
    validate_ssl        = true
  }

  dynamic "content_matchers" {
    for_each = each.value.expected_content == null ? [] : [each.value.expected_content]

    content {
      content = content_matchers.value
      matcher = "CONTAINS_STRING"
    }
  }

  user_labels = {
    environment = var.environment
    service     = each.key
  }

  depends_on = [module.gcp_project, module.cloudflare]
}

resource "google_monitoring_alert_policy" "public_uptime" {
  for_each = google_monitoring_uptime_check_config.public

  project               = var.gcp_project_id
  display_name          = "${title(var.environment)} ${each.key} uptime failure"
  combiner              = "OR"
  notification_channels = google_monitoring_notification_channel.operations_email[*].name

  conditions {
    display_name = "${each.key} failed from multiple checker locations"

    condition_threshold {
      filter = join(" AND ", [
        "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\"",
        "metric.label.check_id=\"${each.value.uptime_check_id}\"",
        "resource.type=\"uptime_url\"",
      ])
      comparison      = "COMPARISON_GT"
      duration        = var.monitoring_config.uptime_failure_duration
      threshold_value = 1

      aggregations {
        alignment_period     = var.monitoring_config.uptime_failure_duration
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content = "The public ${each.key} endpoint failed from at least two Google uptime-check locations. Check DNS, ingress, and the backing workload."
  }

  user_labels = {
    environment = var.environment
    service     = each.key
  }
}

resource "google_logging_metric" "public_workload_errors" {
  count = local.monitoring_workload_alerts_enabled ? 1 : 0

  project     = var.gcp_project_id
  name        = "${var.environment}_public_workload_error_count"
  description = "ERROR-or-higher log entries emitted by configured public workloads."
  filter = join(" AND ", [
    "resource.type=\"k8s_container\"",
    "resource.labels.namespace_name=\"${var.k8s_namespace}\"",
    "(${local.monitoring_workload_filter})",
    "severity>=ERROR",
  ])

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }

  depends_on = [module.gcp_project]
}

resource "google_monitoring_alert_policy" "public_workload_error_spike" {
  count = local.monitoring_workload_alerts_enabled ? 1 : 0

  project               = var.gcp_project_id
  display_name          = "${title(var.environment)} public workload error spike"
  combiner              = "OR"
  notification_channels = google_monitoring_notification_channel.operations_email[*].name

  conditions {
    display_name = "Public workload ERROR logs exceeded threshold"

    condition_threshold {
      filter = join(" AND ", [
        "metric.type=\"logging.googleapis.com/user/${google_logging_metric.public_workload_errors[0].name}\"",
        "resource.type=\"k8s_container\"",
      ])
      comparison      = "COMPARISON_GT"
      duration        = "0s"
      threshold_value = var.monitoring_config.error_count_threshold

      aggregations {
        alignment_period     = var.monitoring_config.error_count_window
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content = "The configured public workload ERROR log count exceeded ${var.monitoring_config.error_count_threshold} during a ${var.monitoring_config.error_count_window} window."
  }

  user_labels = {
    environment = var.environment
    signal      = "error_logs"
  }
}

resource "google_monitoring_alert_policy" "public_workload_restarts" {
  count = local.monitoring_workload_alerts_enabled ? 1 : 0

  project               = var.gcp_project_id
  display_name          = "${title(var.environment)} public workload restart spike"
  combiner              = "OR"
  notification_channels = google_monitoring_notification_channel.operations_email[*].name

  conditions {
    display_name = "Public workload containers restarted repeatedly"

    condition_threshold {
      filter = join(" AND ", [
        "metric.type=\"kubernetes.io/container/restart_count\"",
        "resource.type=\"k8s_container\"",
        "resource.label.namespace_name=\"${var.k8s_namespace}\"",
        "(${replace(local.monitoring_workload_filter, "resource.labels.", "resource.label.")})",
      ])
      comparison      = "COMPARISON_GT"
      duration        = "0s"
      threshold_value = var.monitoring_config.restart_count_threshold

      aggregations {
        alignment_period     = var.monitoring_config.restart_count_window
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content = "The configured public workloads restarted more than ${var.monitoring_config.restart_count_threshold} times during a ${var.monitoring_config.restart_count_window} window."
  }

  user_labels = {
    environment = var.environment
    signal      = "restarts"
  }
}
