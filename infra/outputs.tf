output "region" {
  value = var.region
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.main.name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.app.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.app.domain_name
}

output "public_url" {
  value = "https://${var.domain}"
}
