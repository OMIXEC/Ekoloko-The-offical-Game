output "bucket" { value = aws_s3_bucket.assets.bucket }
output "distribution_domain" { value = aws_cloudfront_distribution.assets.domain_name }
output "distribution_id" { value = aws_cloudfront_distribution.assets.id }
