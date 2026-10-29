resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.project}"
  retention_in_days = 14
}

# API Gateway (HTTP API) の $default stage のアクセスログ。 保持は app Lambda と同じ 14 日。
resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/${var.project}-api"
  retention_in_days = 14
}

# #184: SES bounce handler Lambda の log group を明示管理。
# 旧: Lambda が auto-create する log group は default で **無期限保持** = コスト膨張 risk。
# 14 日に揃える (app Lambda と同方針)。
resource "aws_cloudwatch_log_group" "ses_bounce_handler" {
  name              = "/aws/lambda/${var.project}-ses-bounce-handler"
  retention_in_days = 14
}
