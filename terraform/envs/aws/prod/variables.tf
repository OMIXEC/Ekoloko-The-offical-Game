variable "region" {
  type    = string
  default = "eu-west-1"
}
variable "name" {
  type    = string
  default = "ekoloko-dr"
}
variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}
variable "backend_image" { type = string }
variable "host" { type = string }
variable "client_domain" { type = string }
variable "certificate_arn" { type = string }
variable "secrets" {
  type    = map(string)
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
variable "protect_data" {
  type    = bool
  default = true
}
variable "redis_num_nodes" {
  type    = number
  default = 2
}
