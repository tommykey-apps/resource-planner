# Lambda Web Function (アプリ本体) の周辺リソース (ADR 0014)。
#
# Web Function 本体・revision・endpoint・resource policy は aws provider v6.72.0 で
# aws_lambdaweb_* として入るまで、CD の `aws lambda-web deploy` が作る。
# ここではそれ以外 (コード置き場、ログ、CloudFront の OAC、CD が読む設定値) を持つ。
#
# Refs:
# - https://docs.aws.amazon.com/lambda/latest/dg/web-functions-code-s3.html
# - https://docs.aws.amazon.com/lambda/latest/dg/web-functions-logging.html
# - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda-web.html

locals {
  web_function_name = var.project
  # endpoint のドメインは作成時にランダムに決まり、aws provider v6.71 では参照できない。
  # CD (`aws lambda-web deploy`) が作った prod endpoint の値。aws_lambdaweb_* を import したら参照に置き換える。
  web_function_endpoint_domain = "mvltq34yrffckw14.gyl.lambda-web.ap-northeast-1.on.aws"
}

# ── コード置き場 ──
# revision は S3 オブジェクトの版を固定して参照する。版を消すとその revision は恒久的に
# Failed になるため、古い版を消す lifecycle 規則は付けない。
resource "aws_s3_bucket" "web_function_code" {
  bucket = "${var.project}-web-function-code-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "web_function_code" {
  bucket = aws_s3_bucket.web_function_code.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "web_function_code" {
  bucket                  = aws_s3_bucket.web_function_code.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "web_function_code" {
  bucket = aws_s3_bucket.web_function_code.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_policy" "web_function_code" {
  bucket = aws_s3_bucket.web_function_code.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "LambdaReadsRevisionCode"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = ["s3:GetObject", "s3:GetObjectVersion"]
        Resource  = "${aws_s3_bucket.web_function_code.arn}/*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
          ArnLike = {
            "aws:SourceArn" = "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:web-function/${local.web_function_name}/revision/*"
          }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.web_function_code.arn, "${aws_s3_bucket.web_function_code.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.web_function_code]
}

# ── ログ ──
# Lambda は初回リクエストで保持期限なしのログ群を作るので、先に作って期限を付ける。
# 配信リージョン側の .local に書かれたログが、ホームリージョンの本体に集約される。
resource "aws_cloudwatch_log_group" "web_function" {
  name              = "/aws/lambda/web/${local.web_function_name}"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "web_function_local" {
  name              = "/aws/lambda/web/${local.web_function_name}.local"
  retention_in_days = 14
}

# ── CloudFront からの署名付き呼び出し ──
# Web Function の origin は always-amz-auth だけを受け付ける (aws provider v6 の SDK で検査が通る)。
resource "aws_cloudfront_origin_access_control" "web_function" {
  name                              = "${var.project}-web-function"
  description                       = "CloudFront signs requests to the Lambda Web Function endpoint"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always-amz-auth"
  signing_protocol                  = "sigv4"
}

# ── CD (aws lambda-web deploy) が読む環境変数 ──
# ALLOWED_DOMAIN を含むので SecureString にする。
resource "aws_ssm_parameter" "web_function_env" {
  name = "/${var.project}/web-function-env"
  type = "SecureString"
  value = jsonencode({
    ORIGIN            = "https://${var.domain}"
    DYNAMODB_TABLE    = aws_dynamodb_table.main.name
    ALLOWED_DOMAIN    = var.allowed_domain
    AUTH_SECRET_PARAM = aws_ssm_parameter.auth_secret.name
    AUTH_TRUST_HOST   = "true"
    EMAIL_FROM        = var.email_from
  })
}
