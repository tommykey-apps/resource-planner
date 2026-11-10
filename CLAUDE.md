# resource-planner

要員計画アプリ。SvelteKit (adapter-node) + Lambda Web Functions + DynamoDB + Auth.js (Email Magic Link) 認証。
`@tommykey-apps/ui-components` の ResourceTimeline コンポーネントを使用。

## プロジェクト構成

```
resource-planner/
├── apps/                     # 配置する単位
│   ├── web/                  # SvelteKit (adapter-node)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   └── lib/
│   │   │       ├── features/ # 業務ごと (assignment project resource department team auth)
│   │   │       └── shared/   # 業務をまたぐ部品。features を参照しない (ESLint で禁止)
│   │   ├── scripts/          # Web Function の配布物作成とスモークテスト
│   │   ├── package.json
│   │   └── svelte.config.js
│   └── ses-bounce/           # SES のバウンス・苦情を受けて送信停止リストに入れる Lambda
├── packages/                 # 共有する部品
│   └── db/                   # DynamoDB のキーと保存する entity の型、データ移行スクリプト (migrations/)
├── tests/
│   └── e2e/                  # Playwright (specs/ と fixtures/)
├── infra/                    # Terraform
├── docs/
│   ├── architecture.drawio   # 構成図 (architecture.svg に書き出す)
│   └── db/                   # DB ドキュメント (tbls + 手書き)
├── bin/                      # ローカルツール (tbls など)
├── .github/workflows/        # CI/CD
├── package.json              # pnpm workspace のルート (pnpm の版を固定)
├── pnpm-workspace.yaml       # workspace の範囲と依存の設定
├── knip.json                 # 未使用コードの検出 (ルートから実行)
├── Makefile                  # 開発コマンド
├── docker-compose.yml        # DynamoDB Local
└── .tbls.yml                 # tbls 設定
```

## 開発環境

```bash
flox activate    # nodejs 22 + pnpm 10 + terraform + awscli
```

## 作業ツリー (git worktree)

同じ作業ツリーで複数のセッションが並行して動くことがある。作業は原則 worktree を切って行う:

```bash
git worktree add ../resource-planner-<topic> -b <branch> origin/main
cp apps/web/.env.local ../resource-planner-<topic>/apps/web/.env.local   # git 管理外なので複製が必要
cd ../resource-planner-<topic> && pnpm install
```

共有の作業ツリーでは `git switch` / `git stash` / `git checkout` をしない (他セッションの変更やステージ状態を壊す)。

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

`apps/web/` 直接 (TDD: ADR 0007 参照):

```bash
cd apps/web
pnpm test              # Vitest (unit; DDB Local 起動時は integration も含む)
pnpm test:watch        # watch mode
pnpm test:coverage     # v8 coverage
pnpm check             # svelte-check
```

E2E (Playwright) は `tests/e2e/` で `pnpm test:e2e`。先に `apps/web` で `pnpm build` を済ませる。
ルートの `pnpm check` / `pnpm lint` / `pnpm test` は全パッケージで実行する。

## インフラ

```bash
cd infra
terraform init
terraform plan
terraform apply
```

## アーキテクチャ

- **フロントエンド**: SvelteKit (SSR/Server Actions)
- **ホスティング**: Lambda Web Function (nodejs24.x) + CloudFront (OAC)。詳細: [`docs/adr/0014-lambda-web-functions.md`](docs/adr/0014-lambda-web-functions.md)
- **認証**: Auth.js (`@auth/sveltekit`) + Email Magic Link、`callbacks.signIn` で許可ドメイン制限
  - 詳細: [`docs/adr/0008-auth-migration-clerk-to-authjs.md`](docs/adr/0008-auth-migration-clerk-to-authjs.md)
  - 将来 Microsoft Entra ID 追加: [#68 runbook](https://github.com/tommykey-apps/resource-planner/issues/68)
- **DB**: DynamoDB (Single Table Design)

## DynamoDB スキーマ

Single Table Design (詳細: `docs/db/entities.md`、`docs/db/access-patterns.md`、ADR 0009):

### App entities (Team scope、`pk = TEAM#{teamId}`、初期は `team_default` のみ)

| Entity | SK パターン | Attributes |
|--------|------------|------------|
| Resource | `RES#{id}` | id, name, email (必須・チーム内で一意、 ADR 0015), departmentId |
| Project | `PRJ#{id}` | id, name, color, departmentId (任意、 受注した部署、 ADR 0016) |
| Assignment | `ASN#{id}` | id, resourceId, projectId, startDate, endDateExclusive, version (ADR 0012: 安定キー + 楽観ロック) |
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
   - web: build → 配布物作成 (`pnpm package:web-function`) → `aws lambda-web deploy` → 署名付き疎通確認 → CloudFront 無効化

## TDD 運用 (ADR 0007 / #92)

Claude Code session 内で本 repo を編集する際は **必ず先にテストを書く**。

- `/tdd <task>` skill で workflow ガイド (`.claude/skills/tdd/SKILL.md`)
- `apps/*/src/**.{ts,svelte}` と `packages/*/src/**.ts` の Edit / Write 前に、対応 `*.test.ts` が `git diff --cached` に出るか **PreToolUse hook** が確認 (`.claude/hooks/warn-untested.sh`)
- staged されていなければ `permissionDecision: "ask"` で確認 prompt (deny ではなく ask、iterative work を阻害しない)
- AI / 人間共通の discipline。RED → GREEN → REFACTOR で進める

## コード品質 audit 自動化 (#188)

コーディング後に静的解析 + code review が自動推奨される仕組みを Claude Code hooks + CI で組んでいる。

- **PostToolUse hook** (`Edit|Write`): 編集ファイルを `.claude/state/dirty-files.log` に記録 + `dirty.flag` touch (`.claude/hooks/post-edit-touch.sh`)
- **UserPromptSubmit hook**: dirty なら次ターン頭で `/audit` 推奨を additionalContext に soft 注入 (`.claude/hooks/audit-reminder.sh`、 plain stdout 経由)。 強制 block ではない。 `.claude/state/dirty.flag` を `rm` で skip 可能。 (旧 Stop hook 実装は `additionalContext` を公式仕様で受け付けないため UserPromptSubmit に移行)
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
