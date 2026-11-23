variable "project_id" { type = string }
variable "region" { type = string }
variable "name" { type = string }
variable "image" { type = string }
variable "host" { type = string }
variable "port" {
  type    = number
  default = 8080
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
  type        = map(object({ secret = string, version = string }))
  default     = {}
  description = "Env vars sourced from Secret Manager: NAME = { secret = resource id, version = 'latest' }"
}
variable "db_name" {
  type    = string
  default = "ekoloko"
}
variable "db_username" {
  type    = string
  default = "ekoloko"
}
variable "db_password" {
  type      = string
  sensitive = true
}
variable "db_tier" {
  type    = string
  default = "db-f1-micro"
}
variable "redis_tier" {
  type    = string
  default = "BASIC"
}
variable "session_secret" {
  type      = string
  sensitive = true
}
variable "protect_data" {
  type    = bool
  default = true
}
