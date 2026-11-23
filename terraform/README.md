# Terraform — GCP primary, AWS mirror/DR

Infrastructure for the Ekoloko full build. Backend runs as **one instance with session affinity** because game state (rooms, sessions, trades) is in memory. Do not raise `max_instances` until that state is externalized.

## Layout

```
terraform/
  modules/
    gcp_backend/   Cloud Run v2 service, SA, Secret Manager wiring
    gcp_static/    GCS bucket + Cloud CDN + HTTPS load balancer
    aws_network/   VPC, public subnets, IGW
    aws_backend/   ECR + ECS Fargate (1 task) + ALB with sticky sessions
    aws_static/    S3 + CloudFront with OAC
  envs/
    gcp/{dev,prod} primary
    aws/{dev,prod} mirror / DR
```

## Prerequisites

1. Remote state:
   - GCP: GCS bucket with versioning; copy `envs/gcp/backend.hcl.example` and fill in.
   - AWS: S3 bucket (versioning + encryption) and DynamoDB lock table; copy `envs/aws/backend.hcl.example`.
2. Build and push `docker/backend.Dockerfile` to Artifact Registry (GCP) and ECR (AWS).
3. TLS certificates and DNS for `host` / `client_domain`.
   - AWS ALB cert must be in the env region; CloudFront cert must be in `us-east-1`.
4. Credentials via `gcloud auth application-default login` or AWS SSO/role — no keys in this repo.
5. Optional secrets already created in Secret Manager / Secrets Manager, passed as variables.

## Deploy

```bash
cd terraform/envs/gcp/prod
cp terraform.tfvars.example terraform.tfvars
# edit values
terraform init -backend-config=../backend.hcl.example
terraform fmt -check ../../../modules ../../../envs
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
```

Same commands under `terraform/envs/aws/prod` (and `dev` for either cloud).

CI uses OIDC (Workload Identity Federation on GCP, OIDC role on AWS) — never store cloud keys in GitHub.

## DR / mirror flow

- GCP Cloud Run serves production traffic; GCS + Cloud CDN serves all Flash assets.
- AWS ECS Fargate + S3/CloudFront is kept warm at `desired_count = 1` as a mirror; promote by swapping DNS to the ALB/CloudFront host after a restore test.
- SQLite lives on the service's writable layer in v1 — **back up via the admin/ops job**; restoring data into the DR stack is part of the DR runbook. For zero-loss failover, externalize state to Cloud SQL / RDS in a later phase.

## Production checklist

- [ ] `max_instances = 1` and session affinity/stickiness enabled.
- [ ] `/health` passes behind the LB/CDN.
- [ ] Secrets injected from Secret Manager / Secrets Manager, never tfvars.
- [ ] Seeded `Admin/admin123` removed; MD5 migration planned.
- [ ] CORS and `crossdomain.xml` restricted to the deployed origin.
- [ ] Backups + restore drill + monitoring/alerts configured.
