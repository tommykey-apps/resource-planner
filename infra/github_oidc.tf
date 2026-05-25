resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
}

resource "aws_iam_role" "github_actions" {
  name = "${var.project}-github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:tommykey-apps/resource-planner:*"
          }
        }
      }
    ]
  })
}

#
# #167: GitHub Actions OIDC role の権限を最小化。
#
# 旧: AdministratorAccess (root と同等) ← 漏洩時に AWS account 全権奪取の risk
# 新: PowerUserAccess (= AWS managed: iam:* / organizations:* / account:* を除く全 service)
#     + 自分自身の IAM resource を refresh するための read-only な iam: 権限のみ
#
# trade-off:
# - terraform apply で IAM resource (この role 自身 / OIDC provider) を **変更** する操作は
#   GitHub Actions 側からはできない。 IAM 系の change は admin creds で manual apply する運用。
# - 通常の deploy (Lambda update / ECR push / CloudFront invalidate / terraform apply の
#   IAM 以外の resource) は引き続き CI 経由で完結する。
#
# Refs:
# - AWS IAM Best Practices (least privilege):
#   https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege
# - AWS Managed Policy "PowerUserAccess":
#   https://docs.aws.amazon.com/aws-managed-policy/latest/reference/PowerUserAccess.html
#
resource "aws_iam_role_policy_attachment" "github_actions_poweruser" {
  role       = aws_iam_role.github_actions.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

# PowerUserAccess は iam:* を全 deny するため、 terraform が既存 IAM resource を
# refresh (state plan) するための **read-only な iam: 権限** をこの inline policy で補う。
# write 系 (Create/Update/Delete/Attach/Detach) は意図的に除外。
resource "aws_iam_role_policy" "github_actions_iam_readonly" {
  name = "iam-readonly"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "TerraformIamRefreshReadOnly"
        Effect = "Allow"
        Action = [
          "iam:GetOpenIDConnectProvider",
          "iam:ListOpenIDConnectProviderTags",
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:ListAttachedRolePolicies",
          "iam:ListInstanceProfilesForRole",
          "iam:ListRolePolicies",
          "iam:ListRoleTags"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_ssm_parameter" "github_actions_role_arn" {
  name  = "/${var.project}/github-actions-role-arn"
  type  = "String"
  value = aws_iam_role.github_actions.arn
}
