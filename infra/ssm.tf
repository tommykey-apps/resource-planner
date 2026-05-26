# #186: 通常 String の SSM Parameter を for_each に集約 (旧: 3 個 別 resource)。
# `moved` block で旧 address からの遷移を宣言 → terraform plan は no-op (destroy/create 回避)。
# auth_secret は SecureString + ignore_changes が必要なので別 resource のまま残す。

locals {
  app_metadata_ssm_params = {
    "cloudfront-distribution-id" = aws_cloudfront_distribution.app.id
    "ecr-repository-url"         = aws_ecr_repository.app.repository_url
    "lambda-function-name"       = aws_lambda_function.app.function_name
  }
}

resource "aws_ssm_parameter" "app_metadata" {
  for_each = local.app_metadata_ssm_params
  name     = "/${var.project}/${each.key}"
  type     = "String"
  value    = each.value
}

moved {
  from = aws_ssm_parameter.cloudfront_distribution_id
  to   = aws_ssm_parameter.app_metadata["cloudfront-distribution-id"]
}

moved {
  from = aws_ssm_parameter.ecr_repository_url
  to   = aws_ssm_parameter.app_metadata["ecr-repository-url"]
}

moved {
  from = aws_ssm_parameter.lambda_function_name
  to   = aws_ssm_parameter.app_metadata["lambda-function-name"]
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
