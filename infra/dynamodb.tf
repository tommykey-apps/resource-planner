resource "aws_dynamodb_table" "main" {
  name                        = var.project
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "pk"
  range_key                   = "sk"
  deletion_protection_enabled = true

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  # GSI1: Auth.js DynamoDB adapter (User by email、User by account) と
  # 自前 multi-team 逆引き (USER#{userId} → 所属 team 一覧) を兼用する。
  # 詳細は docs/db/access-patterns.md / issue #81。
  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  # Auth.js Session / VerificationToken の自動失効用 (#81)。
  # adapter のデフォルト attribute 名 = "expires"。
  ttl {
    attribute_name = "expires"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}
