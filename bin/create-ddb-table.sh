#!/usr/bin/env bash
# #186: resource-planner DynamoDB table を DynamoDB Local 上に作成 (with GSI1)。
#
# 旧: ci.yaml の test / test-e2e job、 db-docs.yaml、 Makefile の合計 4 箇所で同じ
# `aws dynamodb create-table` コマンドがコピペ重複していた (PreToolUse コメントで
# 「同期せよ」 と注意書きが回避策化していた)。
#
# 全 caller が本 script を呼ぶことで 1 箇所更新で済むように集約。
#
# env var:
#   ENDPOINT_URL  DynamoDB endpoint (default: http://localhost:8000、 DDB Local)
#   TABLE_NAME    table 名 (default: resource-planner)
#
# DDB Local 用の dummy AWS credentials は caller (Makefile / workflow) が env で渡す前提。
# (aws CLI は credentials が無いと endpoint-url 指定でも warning を出すため)
set -euo pipefail

ENDPOINT_URL="${ENDPOINT_URL:-http://localhost:8000}"
TABLE_NAME="${TABLE_NAME:-resource-planner}"

aws dynamodb create-table \
	--table-name "$TABLE_NAME" \
	--attribute-definitions \
		AttributeName=pk,AttributeType=S \
		AttributeName=sk,AttributeType=S \
		AttributeName=GSI1PK,AttributeType=S \
		AttributeName=GSI1SK,AttributeType=S \
	--key-schema \
		AttributeName=pk,KeyType=HASH \
		AttributeName=sk,KeyType=RANGE \
	--global-secondary-indexes \
		'IndexName=GSI1,KeySchema=[{AttributeName=GSI1PK,KeyType=HASH},{AttributeName=GSI1SK,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
	--billing-mode PAY_PER_REQUEST \
	--endpoint-url "$ENDPOINT_URL"
