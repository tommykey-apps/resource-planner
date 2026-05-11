/**
 * SES bounce / complaint handling (#134)。
 *
 * フロー:
 *   SES → SNS topic → Lambda (ses-bounce-handler) → DynamoDB SUPPRESS#{email} レコード
 *
 * Auth.js の signIn callback で suppression list を check し、 hit したアドレスへの
 * magic link 送信を抑止する (アプリ側 `shouldAllowSignIn`)。 これで SES の
 * sender reputation を維持し、 sandbox 解除後の送信評価低下を防ぐ。
 *
 * **deploy 前提**: 本 Lambda の zip artifact は CI / CD で `pnpm build:lambda` から生成される
 * (web/dist/lambda/ses-bounce-handler.zip)。 ローカル apply 時も同 zip を事前生成する必要あり。
 */

# ── SNS topics: bounce / complaint で分けて publish 順序を保つ ──
resource "aws_sns_topic" "ses_bounce" {
  name = "${var.project}-ses-bounce"
}

resource "aws_sns_topic" "ses_complaint" {
  name = "${var.project}-ses-complaint"
}

# ── SES → SNS notification 設定 (domain identity に紐付け) ──
resource "aws_ses_identity_notification_topic" "bounce" {
  topic_arn                = aws_sns_topic.ses_bounce.arn
  notification_type        = "Bounce"
  identity                 = aws_ses_domain_identity.main.domain
  include_original_headers = false
}

resource "aws_ses_identity_notification_topic" "complaint" {
  topic_arn                = aws_sns_topic.ses_complaint.arn
  notification_type        = "Complaint"
  identity                 = aws_ses_domain_identity.main.domain
  include_original_headers = false
}

# ── Lambda IAM ──
resource "aws_iam_role" "ses_bounce_handler" {
  name = "${var.project}-ses-bounce-handler-role"

  assume_role_policy = jsonencode({
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

resource "aws_iam_role_policy_attachment" "ses_bounce_handler_basic" {
  role       = aws_iam_role.ses_bounce_handler.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "ses_bounce_handler_ddb" {
  name = "${var.project}-ses-bounce-handler-ddb-policy"
  role = aws_iam_role.ses_bounce_handler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        # 本 Lambda は suppression record の Put のみ行う (Get / Update は app Lambda 側)。
        # 最小権限の原則に従って Put だけ許可。
        Action   = ["dynamodb:PutItem"]
        Resource = aws_dynamodb_table.main.arn
      }
    ]
  })
}

# ── Lambda function ──
# zip artifact は CI で esbuild → ./ses-bounce-handler.zip に出力されている前提。
# ローカル apply の場合は `cd ../web && pnpm build:lambda` を先に実行。
data "archive_file" "ses_bounce_handler" {
  type        = "zip"
  source_dir  = "${path.module}/../web/dist/lambda/ses-bounce-handler"
  output_path = "${path.module}/ses-bounce-handler.zip"
}

resource "aws_lambda_function" "ses_bounce_handler" {
  function_name    = "${var.project}-ses-bounce-handler"
  role             = aws_iam_role.ses_bounce_handler.arn
  filename         = data.archive_file.ses_bounce_handler.output_path
  source_code_hash = data.archive_file.ses_bounce_handler.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      DYNAMODB_TABLE = aws_dynamodb_table.main.name
    }
  }
}

# ── SNS → Lambda subscription ──
resource "aws_sns_topic_subscription" "ses_bounce_to_lambda" {
  topic_arn = aws_sns_topic.ses_bounce.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.ses_bounce_handler.arn
}

resource "aws_sns_topic_subscription" "ses_complaint_to_lambda" {
  topic_arn = aws_sns_topic.ses_complaint.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.ses_bounce_handler.arn
}

resource "aws_lambda_permission" "allow_sns_bounce" {
  statement_id  = "AllowSNSBounceInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ses_bounce_handler.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.ses_bounce.arn
}

resource "aws_lambda_permission" "allow_sns_complaint" {
  statement_id  = "AllowSNSComplaintInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ses_bounce_handler.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.ses_complaint.arn
}
