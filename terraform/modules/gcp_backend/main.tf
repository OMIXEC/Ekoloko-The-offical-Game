terraform {
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
}

resource "google_service_account" "backend" {
  project      = var.project_id
  account_id   = "${var.name}-sa"
  display_name = "Ekoloko backend ${var.name}"
}

resource "google_secret_manager_secret_iam_member" "backend" {
  for_each  = local.secret_env_all
  project   = var.project_id
  secret_id = each.value.secret
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_cloud_run_v2_service" "backend" {
  project             = var.project_id
  name                = var.name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true

  template {
    service_account                  = google_service_account.backend.email
    session_affinity                 = true
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.image
      ports { container_port = var.port }

      resources {
        limits            = { cpu = "1", memory = "2Gi" }
        startup_cpu_boost = true
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = tostring(var.port)
      }
      env {
        name  = "EKOLOKO_HOST"
        value = var.host
      }
      env {
        name  = "DB_DRIVER"
        value = "postgres"
      }
      env {
        name  = "ADMIN_REQUIRE_TOTP"
        value = "true"
      }

      dynamic "env" {
        for_each = local.secret_env_all
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/health"
          port = var.port
        }
        initial_delay_seconds = 10
        period_seconds        = 10
        failure_threshold     = 10
      }
      liveness_probe {
        http_get {
          path = "/health"
          port = var.port
        }
        period_seconds    = 30
        failure_threshold = 3
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.backend.location
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
