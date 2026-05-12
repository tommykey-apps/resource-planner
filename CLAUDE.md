# resource-planner

要員計画アプリ。SvelteKit (adapter-node) + Lambda + DynamoDB + Auth.js (Email Magic Link) 認証。
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
make db                # DynamoDB Local 起動 + テーブル作成 (GSI1 含む)
make db-docs           # DB ドキュメント生成
make clean             # コンテナ停止
```

`web/` 直接 (TDD: ADR 0007 参照):

```bash
cd web
pnpm test              # Vitest (unit; DDB Local 起動時は integration も含む)
pnpm test:watch        # watch mode
pnpm test:coverage     # v8 coverage
pnpm test:e2e          # Playwright (実 spec は今後追加)
pnpm check             # svelte-check
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
- **認証**: Auth.js (`@auth/sveltekit`) + Email Magic Link、`callbacks.signIn` で許可ドメイン制限
  - 詳細: [`docs/adr/0008-auth-migration-clerk-to-authjs.md`](docs/adr/0008-auth-migration-clerk-to-authjs.md)
  - 将来 Microsoft Entra ID 追加: [#68 runbook](https://github.com/tommykey-apps/resource-planner/issues/68)
- **DB**: DynamoDB (Single Table Design)

## DynamoDB スキーマ

Single Table Design (詳細: `docs/db/entities.md`、`docs/db/access-patterns.md`、ADR 0009):

### App entities (Team scope、`pk = TEAM#{teamId}`、初期は `team_default` のみ)

| Entity | SK パターン | Attributes |
|--------|------------|------------|
| Resource | `RES#{id}` | id, name |
| Project | `PRJ#{id}` | id, name, color |
| Assignment | `ASN#{start_date}#{id}` | id, resourceId, projectId, startDate, endDateExclusive |
| Team meta | `META` | id, name, createdAt |
| Team membership | `MEMBER#{userId}` | teamId, userId, role, joinedAt |

### Auth.js entities (`@auth/dynamodb-adapter` 管理)

| Entity | PK | SK |
|--------|----|----|
| User | `USER#{userId}` | `META` |
| Account | `USER#{userId}` | `ACCOUNT#{provider}#{providerAccountId}` |
| Session | `SESSION#{token}` | `META` (TTL: `expires`) |
| VerificationToken | `VERIFICATION#{token}` | `META` (TTL: `expires`) |

### GSI1 (3 用途を兼用)

- `GSI1PK = USER#email#{email}` — Auth.js: User by email
- `GSI1PK = ACCOUNT#{provider}` / `GSI1SK = ACCOUNT#{providerAccountId}` — Auth.js: User by account
- `GSI1PK = USER#{userId}` / `GSI1SK = TEAM#{teamId}` — App: user の所属 team 一覧

## デプロイフロー

1. PR → CI (web build, terraform plan)
2. main merge → CD
   - infra 変更時: terraform apply
   - web: docker build → ECR push → Lambda update

## TDD 運用 (ADR 0007 / #92)

Claude Code session 内で本 repo を編集する際は **必ず先にテストを書く**。

- `/tdd <task>` skill で workflow ガイド (`.claude/skills/tdd/SKILL.md`)
- `web/src/**.{ts,svelte}` の Edit / Write 前に、対応 `*.test.ts` が `git diff --cached` に出るか **PreToolUse hook** が確認 (`.claude/hooks/warn-untested.sh`)
- staged されていなければ `permissionDecision: "ask"` で確認 prompt (deny ではなく ask、iterative work を阻害しない)
- AI / 人間共通の discipline。RED → GREEN → REFACTOR で進める

## コード品質 audit 自動化 (#188)

コーディング後に静的解析 + code review が自動推奨される仕組みを Claude Code hooks + CI で組んでいる。

- **PostToolUse hook** (`Edit|Write`): 編集ファイルを `.claude/state/dirty-files.log` に記録 + `dirty.flag` touch (`.claude/hooks/post-edit-touch.sh`)
- **Stop hook**: dirty なら次ターンの additionalContext に「`/audit` 推奨」を soft 通知 (強制 block ではない)。 `.claude/state/dirty.flag` を `rm` で skip 可能
- **`/audit` skill** (user-level): `pnpm check` / `pnpm test` / `knip` (unused) / `jscpd` (重複) / `madge` (循環) → 大規模変更時は `code-reviewer` agent spawn → dirty クリア
- **`code-reviewer` agent** (user-level): SvelteKit 2 / Svelte 5 / TS / Auth.js / DynamoDB / Zod / Terraform の公式 docs 準拠を厳しく見る、 「`unknown` キャスト / マジック数値 / 公式 docs 省略」 等の手癖を重点検出
- **CI audit workflow** (`.github/workflows/audit.yaml`): ローカルバイパスされても PR で同 audit を実行 (`continue-on-error` で main CI と分離)

audit 系コマンドは未 install でも `pnpm dlx` で動的取得。 速度重視なら devDeps 化。

## 関連リポジトリ

- [tommykey-apps/ui-components](https://github.com/tommykey-apps/ui-components) — ResourceTimeline コンポーネント

## AWS リージョン / ドメイン

- リージョン: ap-northeast-1 (東京)
- ドメイン: planner.tommykeyapp.com
- Terraform state: `s3://tommykeyapp-tfstate/resource-planner/terraform.tfstate`
