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

  # aws provider v6 で GSI の hash_key / range_key は非推奨になり、key_schema で書く。
  # Ref: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table#global_secondary_index
  global_secondary_index {
    name            = "GSI1"
    projection_type = "ALL"

    key_schema {
      attribute_name = "GSI1PK"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "GSI1SK"
      key_type       = "RANGE"
    }
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
