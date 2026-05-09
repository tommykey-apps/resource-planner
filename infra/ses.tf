/**
 * SES (Simple Email Service) for Auth.js Magic Link sign-in (#65 / #85).
 *
 * - domain identity: tommykeyapp.com 配下の任意 from address (`noreply@...` 等) で送信可能
 * - DKIM: domain identity 検証 + 受信側スパム判定対策で必須
 * - SES sandbox: 本番 access 申請まで verified email にしか送信できない
 *   → README に「本番投入前に AWS console で sandbox 解除申請」と明記
 *
 * SMTP credentials (`aws_iam_user` + `aws_iam_access_key`) は **発行しない**。
 * Auth.js の sendVerificationRequest を SES SDK (SESv2) で実装するため、
 * Lambda IAM role に `ses:SendEmail` 権限を付与する方針 (lambda.tf 参照)。
 */
resource "aws_ses_domain_identity" "main" {
  domain = "tommykeyapp.com"
}

resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}

resource "aws_route53_record" "ses_dkim" {
  count   = 3
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "${aws_ses_domain_dkim.main.dkim_tokens[count.index]}._domainkey.${aws_ses_domain_identity.main.domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.main.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# domain identity verify を Route53 TXT で完了させる (sandbox 内でも必須)
resource "aws_route53_record" "ses_verification" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "_amazonses.${aws_ses_domain_identity.main.domain}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.main.verification_token]
}

resource "aws_ses_domain_identity_verification" "main" {
  domain     = aws_ses_domain_identity.main.id
  depends_on = [aws_route53_record.ses_verification]
}
