data "aws_caller_identity" "current" {}

# #168: AWS Parameters and Secrets Lambda Extension の最新 layer ARN を SSM の public
# parameter から resolve する (公式 docs 推奨パターン: 手動で version 更新不要)。
# 参考: https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html#ps-integration-lambda-extensions-programmatically-retrieve
# Lambda は arm64 (aws_lambda_function.app.architectures) なので arm64 path を引く。
data "aws_ssm_parameter" "params_secrets_extension" {
  name = "/aws/service/aws-parameters-and-secrets-lambda-extension/arm64/latest"
}

# #186: Lambda assume_role policy は本 module 内 (lambda.tf + ses_bounce.tf) で同一のため
# locals に集約して DRY 化。 jsonencode 単体で十分シンプルなので data "aws_iam_policy_document"
# は採用しない (HashiCorp 公式: locals は「reused value に名前を付ける」 用途を推奨)。
locals {
  lambda_assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role" "lambda" {
  name               = "${var.project}-lambda-role"
  assume_role_policy = local.lambda_assume_role_policy
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "${var.project}-dynamodb-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.main.arn,
          "${aws_dynamodb_table.main.arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_ssm" {
  name = "${var.project}-ssm-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = [aws_ssm_parameter.auth_secret.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = "arn:aws:kms:${var.region}:${data.aws_caller_identity.current.account_id}:alias/aws/ssm"
      }
    ]
  })
}

# SES SendEmail 権限 (#85, refined #89): Auth.js Magic Link を SESv2 SDK 経由で送信。
#
# Resource = "*" + ses:FromAddress condition が AWS docs 推奨パターン:
# - SES は SendEmail の IAM 認可を sender identity ARN に対して評価する
# - **Sandbox モードでは recipient identity ARN にも追加 IAM チェックが走る**
#   ため、Resource を sender 1 件に絞ると recipient で AccessDenied になる
# - Resource = "*" に広げ、from address を ses:FromAddress condition で固定
#   することで「from は固定、to は誰でも (sandbox の verify 強制は SES 側で別途)」
# - ses:ApiVersion=2 で SESv1 経由の悪用も防止 (defense in depth)
# - ses:SendRawEmail は SESv2 SDK では呼ばれないので不要
#
# 参考: https://docs.aws.amazon.com/ses/latest/dg/control-user-access.html
resource "aws_iam_role_policy" "lambda_ses" {
  name = "${var.project}-ses-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SendMagicLinkEmail"
        Effect   = "Allow"
        Action   = ["ses:SendEmail"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "ses:FromAddress" = var.email_from
            "ses:ApiVersion"  = "2"
          }
        }
      }
    ]
  })
}

resource "aws_lambda_function" "app" {
  function_name = var.project
  role          = aws_iam_role.lambda.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.app.repository_url}:latest"
  architectures = ["arm64"]
  timeout       = 30
  memory_size   = 1024

  # #168: Parameters and Secrets Lambda Extension。 INVOKE phase で
  # http://localhost:2773/systemsmanager/parameters/get?... に対して GET すると
  # SSM SecureString を 300s TTL でキャッシュ + decrypt 済の値を返す (SDK 不要)。
  # 既存 IAM (ssm:GetParameter + kms:Decrypt) はそのまま流用。
  layers = [data.aws_ssm_parameter.params_secrets_extension.value]

  environment {
    variables = {
      ORIGIN            = "https://${var.domain}"
      DYNAMODB_TABLE    = aws_dynamodb_table.main.name
      ALLOWED_DOMAIN    = var.allowed_domain
      AUTH_SECRET_PARAM = aws_ssm_parameter.auth_secret.name
      AUTH_TRUST_HOST   = "true"
      EMAIL_FROM        = var.email_from
    }
  }

  depends_on = [aws_ecr_repository.app]

  lifecycle {
    ignore_changes = [image_uri]
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.app.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
