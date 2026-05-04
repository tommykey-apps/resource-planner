resource "aws_cloudfront_distribution" "app" {
  enabled     = true
  price_class = "PriceClass_200"
  aliases     = [var.domain]

  origin {
    domain_name = "${aws_apigatewayv2_api.api.id}.execute-api.${var.region}.amazonaws.com"
    origin_id   = "apigw"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "apigw"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id            = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id   = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
    response_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03"
  }

  ordered_cache_behavior {
    path_pattern           = "/_app/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "apigw"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = data.aws_acm_certificate.wildcard.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
