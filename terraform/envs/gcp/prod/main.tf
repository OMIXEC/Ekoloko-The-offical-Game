terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "backend" {
  source         = "../../../modules/gcp_backend"
  project_id     = var.project_id
  region         = var.region
  name           = "${var.name}-backend"
  image          = var.backend_image
  host           = var.host
  port           = 8080
  min_instances  = var.min_instances
  max_instances  = var.max_instances
  secret_env     = var.secret_env
  db_password    = var.db_password
  session_secret = var.session_secret
  redis_tier     = var.redis_tier
  protect_data   = var.protect_data
}

module "static" {
  source     = "../../../modules/gcp_static"
  project_id = var.project_id
  name       = "${var.name}-client"
  domain     = var.client_domain
  location   = var.assets_location
}
