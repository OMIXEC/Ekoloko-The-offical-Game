terraform {
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
}

resource "google_storage_bucket" "assets" {
  project                     = var.project_id
  name                        = "${var.name}-assets"
  location                    = var.location
  uniform_bucket_level_access = true
  force_destroy               = false
  versioning { enabled = true }
}

resource "google_service_account" "assets_ci" {
  project      = var.project_id
  account_id   = "${var.name}-assets-ci"
  display_name = "Ekoloko asset uploader"
}

resource "google_storage_bucket_iam_member" "assets_ci" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.assets_ci.email}"
}

resource "google_compute_backend_bucket" "assets" {
  project     = var.project_id
  name        = "${var.name}-assets-backend"
  bucket_name = google_storage_bucket.assets.name
  enable_cdn  = true

  cdn_policy {
    cache_mode  = "CACHE_ALL_STATIC"
    default_ttl = 3600
    max_ttl     = 31536000
    client_ttl  = 3600
  }
}

resource "google_compute_managed_ssl_certificate" "assets" {
  project = var.project_id
  name    = "${var.name}-cert"
  managed { domains = [var.domain] }
}

resource "google_compute_global_address" "assets" {
  project = var.project_id
  name    = "${var.name}-ip"
}

resource "google_compute_url_map" "https" {
  project         = var.project_id
  name            = "${var.name}-https"
  default_service = google_compute_backend_bucket.assets.id
}

resource "google_compute_target_https_proxy" "https" {
  project          = var.project_id
  name             = "${var.name}-https-proxy"
  url_map          = google_compute_url_map.https.id
  ssl_certificates = [google_compute_managed_ssl_certificate.assets.id]
}

resource "google_compute_global_forwarding_rule" "https" {
  project               = var.project_id
  name                  = "${var.name}-https-rule"
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "443"
  target                = google_compute_target_https_proxy.https.id
  ip_address            = google_compute_global_address.assets.address
}

resource "google_compute_url_map" "http_redirect" {
  project = var.project_id
  name    = "${var.name}-http-redirect"
  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "http" {
  project = var.project_id
  name    = "${var.name}-http-proxy"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  project               = var.project_id
  name                  = "${var.name}-http-rule"
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "80"
  target                = google_compute_target_http_proxy.http.id
  ip_address            = google_compute_global_address.assets.address
}
