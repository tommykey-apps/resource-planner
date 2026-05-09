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

# Auth.js JWT secret (#85)。`openssl rand -hex 32` で生成し、terraform apply 後に
# `aws ssm put-parameter --name /resource-planner/auth-secret --value <secret> --type SecureString --overwrite`
# で投入する。terraform state に secret 値が残らないよう lifecycle.ignore_changes を設定。
resource "aws_ssm_parameter" "auth_secret" {
  name  = "/${var.project}/auth-secret"
  type  = "SecureString"
  value = "PLACEHOLDER_REPLACE_VIA_AWS_CLI"
  tier  = "Standard"

  lifecycle {
    ignore_changes = [value]
  }
}
