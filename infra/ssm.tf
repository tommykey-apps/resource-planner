resource "aws_ssm_parameter" "cloudfront_distribution_id" {
  name  = "/${var.project}/cloudfront-distribution-id"
  type  = "String"
  value = aws_cloudfront_distribution.app.id
}

resource "aws_ssm_parameter" "ecr_repository_url" {
  name  = "/${var.project}/ecr-repository-url"
  type  = "String"
  value = aws_ecr_repository.app.repository_url
}

resource "aws_ssm_parameter" "lambda_function_name" {
  name  = "/${var.project}/lambda-function-name"
  type  = "String"
  value = aws_lambda_function.app.function_name
}
