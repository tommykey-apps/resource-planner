.PHONY: help dev build db db-docs db-docs-diff clean

-include .env
export

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' Makefile | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Development ──

dev: ## Start SvelteKit dev server
	cd web && pnpm dev

build: ## Build SvelteKit for production
	cd web && pnpm build

# ── Infrastructure ──

# NOTE: 同じ create-table 定義が以下にもある (GSI1 も含めて全箇所同期):
#   - .github/workflows/ci.yaml の test ジョブ
#   - .github/workflows/db-docs.yaml の Create table ステップ
# いずれかを変更したら必ず全箇所を同期すること。
db: ## Start DynamoDB Local + create resource-planner table (with GSI1)
	docker compose up -d dynamodb-local
	@for i in $$(seq 1 30); do \
		curl -s http://localhost:8000 > /dev/null && break; \
		sleep 1; \
	done
	@AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_DEFAULT_REGION=ap-northeast-1 \
		aws dynamodb create-table \
			--table-name resource-planner \
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
			--endpoint-url http://localhost:8000 > /dev/null 2>&1 || true

# ── DB Docs ──

TBLS_VERSION := v1.94.5
TBLS := $(PWD)/bin/tbls
TBLS_OS := $(shell uname -s | tr '[:upper:]' '[:lower:]')
TBLS_ARCH := $(shell uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')

$(TBLS):
	@mkdir -p $(PWD)/bin
	curl -sSL "https://github.com/k1LoW/tbls/releases/download/$(TBLS_VERSION)/tbls_$(TBLS_VERSION)_$(TBLS_OS)_$(TBLS_ARCH).tar.gz" \
		| tar -xz -C $(PWD)/bin tbls
	@chmod +x $(TBLS)

db-docs: db $(TBLS) ## Generate DynamoDB schema docs (docs/db/schema/)
	@AWS_ENDPOINT_URL=http://localhost:8000 \
		AWS_DEFAULT_REGION=ap-northeast-1 \
		AWS_ACCESS_KEY_ID=local \
		AWS_SECRET_ACCESS_KEY=local \
		$(TBLS) doc --force

db-docs-diff: db $(TBLS) ## Show diff between docs/db/schema/ and live DynamoDB Local
	@AWS_ENDPOINT_URL=http://localhost:8000 \
		AWS_DEFAULT_REGION=ap-northeast-1 \
		AWS_ACCESS_KEY_ID=local \
		AWS_SECRET_ACCESS_KEY=local \
		$(TBLS) diff

# ── Cleanup ──

clean: ## Stop and remove containers
	docker compose down
