terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  backend "s3" {}
}

provider "aws" {
  region = var.region
}

module "network" {
  source   = "../../../modules/aws_network"
  name     = "${var.name}-net"
  cidr     = var.vpc_cidr
  az_count = 2
}

module "backend" {
  source          = "../../../modules/aws_backend"
  name            = "${var.name}-backend"
  image           = var.backend_image
  vpc_id          = module.network.vpc_id
  subnet_ids      = module.network.subnet_ids
  certificate_arn = var.certificate_arn
  host            = var.host
  port            = 8080
  secrets         = var.secrets
  db_password     = var.db_password
  session_secret  = var.session_secret
  protect_data    = false
}

module "static" {
  source          = "../../../modules/aws_static"
  name            = "${var.name}-client"
  domain          = var.client_domain
  certificate_arn = var.certificate_arn
}
