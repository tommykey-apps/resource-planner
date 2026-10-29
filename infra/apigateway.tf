resource "aws_apigatewayv2_api" "api" {
  name          = "${var.project}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.app.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  # デプロイ中の Lambda 入れ替えで何が返ったかを追えるよう、アクセスログを残す。
  # 書式は公式例の JSON に、 path と統合先 (Lambda) の結果を足したもの。
  # Refs:
  # - https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging.html
  # - https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging-variables.html
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId          = "$context.requestId"
      ip                 = "$context.identity.sourceIp"
      requestTime        = "$context.requestTime"
      httpMethod         = "$context.httpMethod"
      routeKey           = "$context.routeKey"
      path               = "$context.path"
      status             = "$context.status"
      protocol           = "$context.protocol"
      responseLength     = "$context.responseLength"
      extendedRequestId  = "$context.extendedRequestId"
      integrationStatus  = "$context.integration.status"
      integrationError   = "$context.integration.error"
      integrationLatency = "$context.integration.latency"
      errorMessage       = "$context.error.message"
    })
  }
}
