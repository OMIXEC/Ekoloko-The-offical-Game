# Managed Postgres + Redis for production admin state and sessions.
# Sticky sessions are already enabled via session_affinity in main.tf.

resource "google_sql_database_instance" "backend" {
  project             = var.project_id
  region              = var.region
  name                = "${var.name}-pg"
  database_version    = "POSTGRES_16"
  deletion_protection = var.protect_data

  settings {
    tier      = var.db_tier
    disk_size = 20
    backup_configuration {
      enabled = true
    }
    ip_configuration {
      ipv4_enabled = true
      require_ssl  = true
      authorized_networks {
        name  = "cloud-run"
        value = "0.0.0.0/0"
      }
    }
  }
}

resource "google_sql_database" "backend" {
  project  = var.project_id
  instance = google_sql_database_instance.backend.name
  name     = var.db_name
}

resource "google_sql_user" "backend" {
  project  = var.project_id
  instance = google_sql_database_instance.backend.name
  name     = var.db_username
  password = var.db_password
}

resource "google_redis_instance" "backend" {
  project        = var.project_id
  region         = var.region
  name           = "${var.name}-redis"
  tier           = var.redis_tier
  memory_size_gb = 1
  redis_version  = "REDIS_7_0"
  display_name   = "Ekoloko admin sessions"
  # A Serverless VPC Access connector is required for Cloud Run to reach this
  # private IP; see docs/PRODUCTION_ADMIN.md.
  connect_mode = "DIRECT_PEERING"
}

locals {
  database_url = "postgres://${var.db_username}:${urlencode(var.db_password)}@${google_sql_database_instance.backend.public_ip_address}:5432/${var.db_name}?sslmode=require"
  redis_url    = "redis://${google_redis_instance.backend.host}:6379"

  managed_secrets = {
    DATABASE_URL   = { secret = google_secret_manager_secret.database.secret_id, version = "latest" }
    REDIS_URL      = { secret = google_secret_manager_secret.redis.secret_id, version = "latest" }
    SESSION_SECRET = { secret = google_secret_manager_secret.session.secret_id, version = "latest" }
  }
  secret_env_all = merge(var.secret_env, local.managed_secrets)
}

resource "google_secret_manager_secret" "database" {
  project   = var.project_id
  secret_id = "${var.name}-database-url"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "database" {
  secret      = google_secret_manager_secret.database.id
  secret_data = local.database_url
}

resource "google_secret_manager_secret" "redis" {
  project   = var.project_id
  secret_id = "${var.name}-redis-url"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "redis" {
  secret      = google_secret_manager_secret.redis.id
  secret_data = local.redis_url
}

resource "google_secret_manager_secret" "session" {
  project   = var.project_id
  secret_id = "${var.name}-session-secret"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "session" {
  secret      = google_secret_manager_secret.session.id
  secret_data = var.session_secret
}
