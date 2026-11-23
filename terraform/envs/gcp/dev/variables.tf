variable "project_id" { type = string }
variable "region" {
  type    = string
  default = "europe-west1"
}
variable "name" {
  type    = string
  default = "ekoloko-dev"
}
variable "backend_image" { type = string }
variable "host" { type = string }
variable "client_domain" { type = string }
variable "assets_location" {
  type    = string
  default = "EU"
}
variable "min_instances" {
  type    = number
  default = 1
}
variable "max_instances" {
  type    = number
  default = 1
}
variable "secret_env" {
  type    = map(object({ secret = string, version = string }))
  default = {}
}
variable "db_password" {
  type      = string
  sensitive = true
}
variable "session_secret" {
  type      = string
  sensitive = true
}
