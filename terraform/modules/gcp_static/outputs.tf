output "bucket" { value = google_storage_bucket.assets.name }
output "cdn_ip" { value = google_compute_global_address.assets.address }
output "uploader_service_account" { value = google_service_account.assets_ci.email }
