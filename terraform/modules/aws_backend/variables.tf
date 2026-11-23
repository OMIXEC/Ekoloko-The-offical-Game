variable "name" { type = string }
variable "image" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "certificate_arn" { type = string }
variable "host" { type = string }
variable "port" {
  type    = number
  default = 8080
}
variable "secrets" {
  type        = map(string)
  default     = {}
  description = "Env var name -> Secrets Manager / SSM parameter ARN"
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
variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
}
variable "db_allocated_storage" {
  type    = number
  default = 20
}
variable "db_skip_final_snapshot" {
  type    = bool
  default = false
}
variable "redis_node_type" {
  type    = string
  default = "cache.t3.micro"
}
variable "redis_num_nodes" {
  type    = number
  default = 1
}
variable "session_secret" {
  type      = string
  sensitive = true
}
variable "protect_data" {
  type    = bool
  default = true
}
