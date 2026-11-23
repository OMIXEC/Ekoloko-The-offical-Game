output "service_name" { value = google_cloud_run_v2_service.backend.name }
output "service_uri" { value = google_cloud_run_v2_service.backend.uri }
output "service_account" { value = google_service_account.backend.email }
