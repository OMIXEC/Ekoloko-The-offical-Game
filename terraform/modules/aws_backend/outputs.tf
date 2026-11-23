output "ecr_repository" { value = aws_ecr_repository.backend.repository_url }
output "alb_dns" { value = aws_lb.backend.dns_name }
output "cluster" { value = aws_ecs_cluster.backend.name }
output "service" { value = aws_ecs_service.backend.name }
