# Provision infrastructure and secrets

Type: task
Status: open
Blocked by: Decide deployment topology for a remote user base

## Question

What infrastructure exists after provisioning, and where do secrets live?

## Current state

`.env.example`, Docker Compose, Terraform modules/environments and CI exist, but no concrete domain, DNS records, TLS certificate, cloud project or secret store has been provisioned. Needs recorded facts: hostnames, project IDs, IP, DNS, TLS method, SSH/deploy identity and secret locations — never secret values.
