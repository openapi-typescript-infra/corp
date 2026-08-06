# Optional cross-service reporting ingestion. Each configured PostgreSQL
# database is replicated into its own raw BigQuery dataset so service ownership
# remains visible and modeled reporting data can be built above it.

resource "google_compute_subnetwork" "datastream_psc" {
  count = local.datastream_enabled ? 1 : 0

  name                     = "${var.environment}-datastream-psc"
  project                  = var.gcp_project_id
  region                   = var.gcp_region
  network                  = module.networking.network_id
  ip_cidr_range            = var.datastream_config.psc_subnet_cidr
  private_ip_google_access = true

  depends_on = [module.gcp_project, module.networking]
}

resource "google_compute_network_attachment" "datastream" {
  count = local.datastream_enabled ? 1 : 0

  name                  = "${var.environment}-datastream"
  project               = var.gcp_project_id
  region                = var.gcp_region
  description           = "Private Service Connect attachment for Datastream CDC"
  connection_preference = "ACCEPT_MANUAL"
  producer_accept_lists = var.datastream_config.psc_producer_projects
  subnetworks           = [google_compute_subnetwork.datastream_psc[0].id]
}

resource "google_datastream_private_connection" "reporting" {
  count    = local.datastream_enabled ? 1 : 0
  provider = google-beta

  private_connection_id = "${var.environment}-reporting"
  display_name          = "${var.environment} reporting"
  project               = var.gcp_project_id
  location              = var.gcp_region

  labels = {
    environment = var.environment
    purpose     = "reporting"
  }

  psc_interface_config {
    network_attachment = google_compute_network_attachment.datastream[0].id
  }

  depends_on = [module.gcp_project]
}

resource "google_bigquery_dataset" "reporting_raw" {
  for_each = local.datastream_sources

  dataset_id                 = "${var.datastream_config.raw_dataset_prefix}${replace(each.key, "-", "_")}"
  friendly_name              = "Raw ${each.key} CDC"
  description                = "Datastream-managed raw replica of the ${each.value.database} PostgreSQL database."
  project                    = var.gcp_project_id
  location                   = var.gcp_region
  delete_contents_on_destroy = false
  max_time_travel_hours      = 168

  labels = {
    environment = var.environment
    purpose     = "reporting"
    source      = replace(each.key, "_", "-")
  }

  depends_on = [module.gcp_project]
}

resource "google_bigquery_dataset" "reporting" {
  count = local.datastream_enabled ? 1 : 0

  dataset_id                 = var.datastream_config.reporting_dataset_id
  friendly_name              = "Reporting models"
  description                = "Stable cross-service reporting views and modeled tables."
  project                    = var.gcp_project_id
  location                   = var.gcp_region
  delete_contents_on_destroy = false
  max_time_travel_hours      = 168

  labels = {
    environment = var.environment
    purpose     = "reporting"
  }

  depends_on = [module.gcp_project]
}

resource "google_bigquery_dataset" "reporting_staging" {
  count = local.datastream_enabled ? 1 : 0

  dataset_id                 = var.datastream_config.reporting_staging_dataset_id
  friendly_name              = "Reporting staging models"
  description                = "Private staging and intermediate views used to build reporting models."
  project                    = var.gcp_project_id
  location                   = var.gcp_region
  delete_contents_on_destroy = false
  max_time_travel_hours      = 168

  labels = {
    environment = var.environment
    purpose     = "reporting"
    layer       = "staging"
  }

  depends_on = [module.gcp_project]
}

resource "google_bigquery_dataset_access" "reporting_staging_raw_access" {
  for_each = local.datastream_sources

  project    = google_bigquery_dataset.reporting_raw[each.key].project
  dataset_id = google_bigquery_dataset.reporting_raw[each.key].dataset_id

  dataset {
    dataset {
      project_id = google_bigquery_dataset.reporting_staging[0].project
      dataset_id = google_bigquery_dataset.reporting_staging[0].dataset_id
    }
    target_types = ["VIEWS"]
  }
}

resource "google_bigquery_dataset_access" "reporting_staging_reporting_access" {
  count = local.datastream_enabled ? 1 : 0

  project    = google_bigquery_dataset.reporting_staging[0].project
  dataset_id = google_bigquery_dataset.reporting_staging[0].dataset_id

  dataset {
    dataset {
      project_id = google_bigquery_dataset.reporting[0].project
      dataset_id = google_bigquery_dataset.reporting[0].dataset_id
    }
    target_types = ["VIEWS"]
  }
}

resource "google_project_iam_member" "reporting_builder_job_user" {
  count = local.datastream_enabled ? 1 : 0

  project = var.gcp_project_id
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${module.github_wif.service_account_email}"
}

resource "google_bigquery_dataset_access" "reporting_builder_raw_viewer" {
  for_each = local.datastream_sources

  project       = google_bigquery_dataset.reporting_raw[each.key].project
  dataset_id    = google_bigquery_dataset.reporting_raw[each.key].dataset_id
  role          = "roles/bigquery.dataViewer"
  user_by_email = module.github_wif.service_account_email
}

resource "google_bigquery_dataset_access" "reporting_builder_staging_editor" {
  count = local.datastream_enabled ? 1 : 0

  project       = google_bigquery_dataset.reporting_staging[0].project
  dataset_id    = google_bigquery_dataset.reporting_staging[0].dataset_id
  role          = "roles/bigquery.dataEditor"
  user_by_email = module.github_wif.service_account_email
}

resource "google_bigquery_dataset_iam_member" "reporting_builder_reporting_editor" {
  count = local.datastream_enabled ? 1 : 0

  project    = google_bigquery_dataset.reporting[0].project
  dataset_id = google_bigquery_dataset.reporting[0].dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${module.github_wif.service_account_email}"
}

resource "google_datastream_connection_profile" "reporting_bigquery" {
  count = local.datastream_enabled ? 1 : 0

  connection_profile_id = "${var.environment}-reporting-bigquery"
  display_name          = "${var.environment} reporting BigQuery"
  project               = var.gcp_project_id
  location              = var.gcp_region

  labels = {
    environment = var.environment
    purpose     = "reporting"
  }

  bigquery_profile {}

  depends_on = [module.gcp_project]
}

resource "kubernetes_secret" "datastream_db_credentials" {
  count = local.datastream_enabled ? 1 : 0

  metadata {
    name      = "datastream-db-credentials"
    namespace = kubernetes_namespace.app.metadata[0].name
  }

  data = merge(
    {
      for instance_key, connection in module.cloud_sql.connection_info :
      "${instance_key}-admin-username" => connection.username
      if contains(toset([for source in local.datastream_sources : source.instance_key]), instance_key)
    },
    {
      for instance_key, connection in module.cloud_sql.connection_info :
      "${instance_key}-admin-password" => connection.password
      if contains(toset([for source in local.datastream_sources : source.instance_key]), instance_key)
    },
    {
      for instance_key, connection in module.cloud_sql.datastream_connection_info :
      "${instance_key}-username" => connection.username
    },
    {
      for instance_key, connection in module.cloud_sql.datastream_connection_info :
      "${instance_key}-password" => connection.password
    },
  )

  depends_on = [module.cloud_sql, kubernetes_namespace.app]
}

# PostgreSQL publications, replication slots, and grants must exist before a
# stream starts. Running the bootstrap inside GKE preserves private-only Cloud
# SQL networking and keeps setup repeatable.
resource "kubernetes_job_v1" "datastream_postgresql_bootstrap" {
  for_each = local.datastream_sources

  metadata {
    name      = "datastream-${replace(each.key, "_", "-")}-bootstrap"
    namespace = kubernetes_namespace.app.metadata[0].name
    labels = {
      "app.kubernetes.io/name"      = "datastream-bootstrap"
      "app.kubernetes.io/component" = "reporting"
      "app.kubernetes.io/instance"  = replace(each.key, "_", "-")
    }
  }

  spec {
    backoff_limit = 6

    template {
      metadata {
        labels = {
          "app.kubernetes.io/name"      = "datastream-bootstrap"
          "app.kubernetes.io/component" = "reporting"
          "app.kubernetes.io/instance"  = replace(each.key, "_", "-")
        }
      }

      spec {
        restart_policy = "OnFailure"

        container {
          name    = "postgresql-bootstrap"
          image   = var.datastream_config.bootstrap_image
          command = ["/bin/sh", "-ec"]
          args = [<<-SCRIPT
            until pg_isready --quiet; do
              echo "Waiting for PostgreSQL"
              sleep 2
            done

            psql \
              --set=ON_ERROR_STOP=1 \
              --set=datastream_user="$DATASTREAM_USER" \
              --set=source_schema="$SOURCE_SCHEMA" \
              --set=publication="$PUBLICATION" <<'SQL'
            SELECT format('ALTER ROLE %I WITH REPLICATION', :'datastream_user') \gexec
            SELECT format('GRANT USAGE ON SCHEMA %I TO %I', :'source_schema', :'datastream_user') \gexec
            SELECT format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO %I', :'source_schema', :'datastream_user') \gexec
            SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT ON TABLES TO %I', :'source_schema', :'datastream_user') \gexec
            SELECT format('CREATE PUBLICATION %I FOR TABLES IN SCHEMA %I', :'publication', :'source_schema')
            WHERE NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = :'publication') \gexec
            SQL

            PGUSER="$DATASTREAM_USER" PGPASSWORD="$DATASTREAM_PASSWORD" psql \
              --set=ON_ERROR_STOP=1 \
              --set=replication_slot="$REPLICATION_SLOT" <<'SQL'
            SELECT pg_create_logical_replication_slot(:'replication_slot', 'pgoutput')
            WHERE NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = :'replication_slot');
            SQL
          SCRIPT
          ]

          env {
            name  = "PGHOST"
            value = module.cloud_sql.connection_info[each.value.instance_key].host
          }

          env {
            name  = "PGPORT"
            value = tostring(module.cloud_sql.connection_info[each.value.instance_key].port)
          }

          env {
            name  = "PGDATABASE"
            value = each.value.database
          }

          env {
            name = "PGUSER"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.datastream_db_credentials[0].metadata[0].name
                key  = "${each.value.instance_key}-admin-username"
              }
            }
          }

          env {
            name = "PGPASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.datastream_db_credentials[0].metadata[0].name
                key  = "${each.value.instance_key}-admin-password"
              }
            }
          }

          env {
            name = "DATASTREAM_USER"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.datastream_db_credentials[0].metadata[0].name
                key  = "${each.value.instance_key}-username"
              }
            }
          }

          env {
            name = "DATASTREAM_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.datastream_db_credentials[0].metadata[0].name
                key  = "${each.value.instance_key}-password"
              }
            }
          }

          env {
            name  = "SOURCE_SCHEMA"
            value = each.value.schema
          }

          env {
            name  = "PUBLICATION"
            value = coalesce(each.value.publication, "${replace(var.environment, "-", "_")}_${replace(each.key, "-", "_")}_datastream")
          }

          env {
            name  = "REPLICATION_SLOT"
            value = coalesce(each.value.replication_slot, "${replace(var.environment, "-", "_")}_${replace(each.key, "-", "_")}_datastream")
          }
        }
      }
    }
  }

  wait_for_completion = true

  depends_on = [
    module.cloud_sql,
    module.gke,
    kubernetes_secret.datastream_db_credentials,
  ]
}

resource "google_datastream_connection_profile" "reporting_postgresql" {
  for_each = local.datastream_sources

  connection_profile_id = "${var.environment}-reporting-${replace(each.key, "_", "-")}"
  display_name          = "${var.environment} reporting ${each.key}"
  project               = var.gcp_project_id
  location              = var.gcp_region

  labels = {
    environment = var.environment
    purpose     = "reporting"
    source      = replace(each.key, "_", "-")
  }

  postgresql_profile {
    hostname = module.cloud_sql.datastream_connection_info[each.value.instance_key].host
    port     = module.cloud_sql.datastream_connection_info[each.value.instance_key].port
    username = module.cloud_sql.datastream_connection_info[each.value.instance_key].username
    password = module.cloud_sql.datastream_connection_info[each.value.instance_key].password
    database = each.value.database
  }

  private_connectivity {
    private_connection = google_datastream_private_connection.reporting[0].id
  }

  depends_on = [
    google_datastream_private_connection.reporting,
    kubernetes_job_v1.datastream_postgresql_bootstrap,
  ]
}

resource "google_datastream_stream" "reporting" {
  for_each = local.datastream_sources

  stream_id     = "${var.environment}-reporting-${replace(each.key, "_", "-")}"
  display_name  = "${var.environment} reporting ${each.key}"
  project       = var.gcp_project_id
  location      = var.gcp_region
  desired_state = "RUNNING"

  labels = {
    environment = var.environment
    purpose     = "reporting"
    source      = replace(each.key, "_", "-")
  }

  source_config {
    source_connection_profile = google_datastream_connection_profile.reporting_postgresql[each.key].id

    postgresql_source_config {
      publication                   = coalesce(each.value.publication, "${replace(var.environment, "-", "_")}_${replace(each.key, "-", "_")}_datastream")
      replication_slot              = coalesce(each.value.replication_slot, "${replace(var.environment, "-", "_")}_${replace(each.key, "-", "_")}_datastream")
      max_concurrent_backfill_tasks = var.datastream_config.backfill_concurrency

      include_objects {
        postgresql_schemas {
          schema = each.value.schema
        }
      }
    }
  }

  destination_config {
    destination_connection_profile = google_datastream_connection_profile.reporting_bigquery[0].id

    bigquery_destination_config {
      data_freshness = var.datastream_config.data_freshness

      single_target_dataset {
        dataset_id = google_bigquery_dataset.reporting_raw[each.key].id
      }

      merge {}
    }
  }

  backfill_all {}

  depends_on = [kubernetes_job_v1.datastream_postgresql_bootstrap]
}
