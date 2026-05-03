output "region" {
  value = var.region
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.main.name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "lambda_function_name" {
  value = aws_lambda_function.app.function_name
}

output "api_gateway_url" {
  value = aws_apigatewayv2_stage.default.invoke_url
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
