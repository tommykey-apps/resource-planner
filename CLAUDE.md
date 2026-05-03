# resource-planner

要員計画アプリ。SvelteKit (adapter-node) + Lambda + DynamoDB + Clerk 認証。
`@tommykey-apps/ui-components` の ResourceTimeline コンポーネントを使用。

## プロジェクト構成

```
resource-planner/
├── web/                      # SvelteKit (adapter-node)
│   ├── src/
│   │   ├── routes/
│   │   └── lib/
│   ├── Dockerfile            # Lambda container
│   ├── package.json
│   └── svelte.config.js
├── infra/                    # Terraform
├── docs/
│   ├── architecture.drawio   # アーキテクチャ図
│   └── db/                   # DB ドキュメント (tbls + 手書き)
├── bin/                      # ローカルツール (tbls など)
├── .github/workflows/        # CI/CD
├── Makefile                  # 開発コマンド
├── docker-compose.yml        # DynamoDB Local
└── .tbls.yml                 # tbls 設定
```

## 開発環境

```bash
flox activate    # nodejs 22 + pnpm 10 + terraform + awscli
```

## 認証 (private package 取得)

`@tommykey-apps/ui-components` は GitHub Packages の private なので `GITHUB_TOKEN` 必須:

```bash
export GITHUB_TOKEN=$(gh auth token)
```

## コマンド

```bash
make help              # 利用可能なコマンド一覧
make dev               # SvelteKit dev server
make build             # 本番ビルド
make db                # DynamoDB Local 起動 + テーブル作成
make db-docs           # DB ドキュメント生成
make clean             # コンテナ停止
```

## インフラ

```bash
cd infra
terraform init
terraform plan
terraform apply
```

## アーキテクチャ

- **フロントエンド**: SvelteKit (SSR/Server Actions)
- **ホスティング**: Lambda (container) + CloudFront
- **認証**: Clerk (Microsoft Social Connection + アプリ側ドメイン制限)
- **DB**: DynamoDB (Single Table Design)

## DynamoDB スキーマ

Single Table Design:
- **pk**: `ORG#{clerk_org_id}` (マルチテナント)
- **sk**: エンティティ別 (`RES#`, `PRJ#`, `ASN#`)

| Entity | SK パターン | Attributes |
|--------|------------|------------|
| Resource | `RES#{id}` | id, name |
| Project | `PRJ#{id}` | id, name, color |
| Assignment | `ASN#{start_date}#{id}` | id, resourceId, projectId, startDate, endDate |

詳細: `docs/db/entities.md`, `docs/db/access-patterns.md`

## デプロイフロー

1. PR → CI (web build, terraform plan)
2. main merge → CD
   - infra 変更時: terraform apply
   - web: docker build → ECR push → Lambda update

## 関連リポジトリ

- [tommykey-apps/ui-components](https://github.com/tommykey-apps/ui-components) — ResourceTimeline コンポーネント

## AWS リージョン / ドメイン

- リージョン: ap-northeast-1 (東京)
- ドメイン: planner.tommykeyapp.com
- Terraform state: `s3://tommykeyapp-tfstate/resource-planner/terraform.tfstate`
