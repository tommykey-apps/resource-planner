data "aws_caller_identity" "current" {}

resource "aws_iam_role" "lambda" {
  name = "${var.project}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
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
        Effect = "Allow"
        Action = ["ssm:GetParameter"]
        Resource = [
          aws_ssm_parameter.clerk_secret_key.arn,
          aws_ssm_parameter.auth_secret.arn
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = "arn:aws:kms:${var.region}:${data.aws_caller_identity.current.account_id}:alias/aws/ssm"
      }
    ]
  })
}

# SES SendEmail 権限 (#85): Auth.js Magic Link を SESv2 SDK 経由で送信する。
# domain identity (tommykeyapp.com) からの送信のみ許可。
resource "aws_iam_role_policy" "lambda_ses" {
  name = "${var.project}-ses-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = aws_ses_domain_identity.main.arn
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

  environment {
    variables = {
      ORIGIN                       = "https://${var.domain}"
      DYNAMODB_TABLE               = aws_dynamodb_table.main.name
      CLERK_SECRET_KEY_PARAM       = aws_ssm_parameter.clerk_secret_key.name
      PUBLIC_CLERK_PUBLISHABLE_KEY = var.clerk_publishable_key
      ALLOWED_DOMAIN               = var.allowed_domain
      AUTH_SECRET_PARAM            = aws_ssm_parameter.auth_secret.name
      AUTH_TRUST_HOST              = "true"
      EMAIL_FROM                   = var.email_from
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
