# Managed Postgres + Redis for production admin state and sessions.
# Sticky sessions are configured on the ALB target group in main.tf.

resource "aws_security_group" "database" {
  name        = "${var.name}-db-sg"
  description = "Postgres access from Ekoloko backend only"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.service.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "redis" {
  name        = "${var.name}-redis-sg"
  description = "Redis access from Ekoloko backend only"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.service.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_subnet_group" "backend" {
  name       = "${var.name}-db-subnets"
  subnet_ids = var.subnet_ids
}

resource "aws_db_instance" "backend" {
  identifier                = "${var.name}-pg"
  engine                    = "postgres"
  engine_version            = "16"
  instance_class            = var.db_instance_class
  allocated_storage         = var.db_allocated_storage
  db_name                   = var.db_name
  username                  = var.db_username
  password                  = var.db_password
  db_subnet_group_name      = aws_db_subnet_group.backend.name
  vpc_security_group_ids    = [aws_security_group.database.id]
  skip_final_snapshot       = var.db_skip_final_snapshot
  final_snapshot_identifier = "${var.name}-pg-final"
  storage_encrypted         = true
  deletion_protection       = var.protect_data
  backup_retention_period   = 7
  publicly_accessible       = false
  apply_immediately         = false
}

resource "aws_elasticache_subnet_group" "backend" {
  name       = "${var.name}-cache-subnets"
  subnet_ids = var.subnet_ids
}

resource "aws_elasticache_replication_group" "backend" {
  replication_group_id       = substr("${var.name}-redis", 0, 40)
  description                = "Ekoloko admin sessions"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  num_cache_clusters         = var.redis_num_nodes
  subnet_group_name          = aws_elasticache_subnet_group.backend.name
  security_group_ids         = [aws_security_group.redis.id]
  parameter_group_name       = "default.redis7"
  port                       = 6379
  automatic_failover_enabled = var.redis_num_nodes > 1
  multi_az_enabled           = var.redis_num_nodes > 1
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false
  apply_immediately          = false
}

locals {
  database_url = "postgres://${var.db_username}:${urlencode(var.db_password)}@${aws_db_instance.backend.address}:${aws_db_instance.backend.port}/${var.db_name}"
  redis_url    = "redis://${aws_elasticache_replication_group.backend.primary_endpoint_address}:6379"

  effective_secrets = merge(var.secrets, {
    DATABASE_URL   = aws_secretsmanager_secret.database.arn
    REDIS_URL      = aws_secretsmanager_secret.redis.arn
    SESSION_SECRET = aws_secretsmanager_secret.session.arn
  })
}

resource "aws_secretsmanager_secret" "database" {
  name                    = "${var.name}/DATABASE_URL"
  recovery_window_in_days = var.protect_data ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id     = aws_secretsmanager_secret.database.id
  secret_string = local.database_url
}

resource "aws_secretsmanager_secret" "redis" {
  name                    = "${var.name}/REDIS_URL"
  recovery_window_in_days = var.protect_data ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "redis" {
  secret_id     = aws_secretsmanager_secret.redis.id
  secret_string = local.redis_url
}

resource "aws_secretsmanager_secret" "session" {
  name                    = "${var.name}/SESSION_SECRET"
  recovery_window_in_days = var.protect_data ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "session" {
  secret_id     = aws_secretsmanager_secret.session.id
  secret_string = var.session_secret
}
