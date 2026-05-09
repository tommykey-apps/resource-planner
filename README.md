# resource-planner

要員計画アプリ — Svelte 5 + Tailwind v4 + `@tommykey-apps/ui-components` 消費。

## Tech Stack

| Layer | Tool | Version |
|---|---|---|
| Runtime | Node.js | 22 |
| Package Manager | pnpm | 10 |
| Framework | SvelteKit | 2.58 |
| UI | Svelte | 5.55+ |
| Bundler | Vite | 8 |
| Styling | Tailwind CSS | 4 |
| Component Library | `@tommykey-apps/ui-components` | (private) |
| Adapter | `@sveltejs/adapter-node` | 5 |
| Auth | Clerk (Microsoft Social Connection) | 1.1+ |
| DB | DynamoDB (Single Table Design) | — |
| Hosting | Lambda (ARM64 container) + API Gateway HTTP API + CloudFront | — |
| Type Checking | TypeScript / svelte-check | 6 / 4 |
| Linter | ESLint + Prettier | 10 / 3 |
| Dev Env | flox | 1.11 |

## 開発環境

**flox を使う。** 手動で Node や pnpm をインストールしない。

```bash
flox activate
```

## 認証 (`@tommykey-apps/*` private packageを取得)

GitHub Packages から private package を取得するため、`GITHUB_TOKEN` 環境変数(`read:packages` スコープを持つ PAT)が必要:

```bash
export GITHUB_TOKEN=$(gh auth token)   # gh が tommykey0925 / tommykey-apps 配下にアクセス権を持つ場合
# または明示的に PAT を設定:
# export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxx
```

`.npmrc` で `${GITHUB_TOKEN}` を参照しているので、env が設定されていれば `pnpm install` 経由で透過的に解決される。

CI では `secrets.GITHUB_TOKEN` をそのまま使う(`.github/workflows/ci.yaml` 参照)。

## コマンド

ルート (`Makefile`):

```bash
make help          # 利用可能なコマンド一覧
make dev           # SvelteKit dev server (cd web && pnpm dev)
make build         # 本番ビルド (Lambda container 用)
make db            # DynamoDB Local 起動 + table 作成 (port 8000)
make db-docs       # tbls で docs/db/schema/ 再生成
make db-docs-diff  # スキーマ drift 確認
make clean         # docker compose down
```

`web/` 直接:

```bash
cd web
pnpm install               # 依存インストール (要 GITHUB_TOKEN)
pnpm dev                   # Vite dev server
pnpm build                 # ビルド (build/ に出力、Lambda 用)
pnpm check                 # svelte-check
pnpm format                # Prettier 自動修正
pnpm test                  # Vitest (unit; DDB Local 起動時は integration も含む)
pnpm test:watch            # Vitest watch mode
pnpm test:coverage         # Vitest + v8 coverage
```

### 統合テストの実行

`web/src/lib/repository/integration.test.ts` は `AWS_ENDPOINT_URL` が設定されている時のみ実行
([`describe.runIf`](https://vitest.dev/api/#describe-runif))。ローカルで integration まで含めて実行するには:

```bash
make db                    # DynamoDB Local 起動 + table 作成
cd web
AWS_ENDPOINT_URL=http://localhost:8000 \
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_DEFAULT_REGION=ap-northeast-1 \
DYNAMODB_TABLE=resource-planner \
pnpm test
```

CI では `.github/workflows/ci.yaml` の `test` job が `services.dynamodb` で起動して unit + integration を一括実行する。
詳細方針は [ADR 0007](docs/adr/0007-tdd-with-vitest-and-playwright.md) 参照。

## アーキテクチャ

![Architecture](docs/architecture.png)

> [docs/architecture.drawio](docs/architecture.drawio) を draw.io で開くと編集できる。
> 図を更新したら `drawio-png` skill (またはローカル draw.io GUI) で `docs/architecture.png` を再 export して commit する。

## 設計ドキュメントの読み方

本リポジトリは **型駆動 docs 戦略** を採用している ([ADR 0001](docs/adr/0001-typescript-types-as-api-spec.md))。
OpenAPI は使わず、TypeScript 型 + Zod schema を API 仕様の正本とし、自然言語ドキュメントは
役割を分けて 4 箇所に集約する。

**📖 公開 docs**: <https://tommykey-apps.github.io/resource-planner/>

| 何が知りたい | どこを見る | Pages |
|---|---|---|
| **構造** (どのコンポーネントがどう繋がっているか) | [`docs/architecture.drawio`](docs/architecture.drawio) ([PNG](docs/architecture.png)) — C4 Container 図 | [/architecture.png](https://tommykey-apps.github.io/resource-planner/architecture.png) |
| **なぜ** その判断をしたか | [`docs/adr/`](docs/adr/) — Architecture Decision Records (Michael Nygard 形式) | [/adr/](https://tommykey-apps.github.io/resource-planner/adr/) |
| **どう動く** か (画面 → action → DB の流れ) | [`docs/use-cases.md`](docs/use-cases.md) — Mermaid sequence diagrams | [/use-cases.html](https://tommykey-apps.github.io/resource-planner/use-cases.html) |
| **データモデル** (PK / SK / 属性 / クエリパターン) | [`docs/db/`](docs/db/) — tbls 自動生成 + 手書き entities/access-patterns | [/db/](https://tommykey-apps.github.io/resource-planner/db/) |
| **API 仕様** (関数の入出力) | TypeScript 型 (`web/src/lib/types.ts`, Zod schema) | (コード直読) |

### Architecture Decision Records

| # | タイトル | Status |
|---|---|---|
| [0001](docs/adr/0001-typescript-types-as-api-spec.md) | TypeScript 型を API 仕様の正本とする | Accepted |
| [0002](docs/adr/0002-id-generation-with-ulid.md) | ID 生成戦略を ULID に統一する | Accepted |
| [0003](docs/adr/0003-end-date-inclusive-storage.md) | endDate は inclusive で保存する | Superseded by 0004 |
| [0004](docs/adr/0004-end-date-exclusive-with-form-transform.md) | endDate は exclusive 半開区間 + Zod transform | Accepted |
| [0005](docs/adr/0005-assignment-drag-resize-transport.md) | Assignment ドラッグ / リサイズは `+server.ts` API + Optimistic UI | Accepted |
| [0006](docs/adr/0006-cascade-delete-strategy.md) | Resource / Project の削除は cascade (TransactWriteItems) | Accepted |

### Use Cases

| UC | タイトル | 実装 |
|---|---|---|
| [UC-01](docs/use-cases.md#uc-01-リソース-人-を追加編集削除する) | リソース (人) を追加・編集・削除する | PR-C |
| [UC-02](docs/use-cases.md#uc-02-案件-project-を追加編集削除する) | 案件 (Project) を追加・編集・削除する | PR-D |
| [UC-03](docs/use-cases.md#uc-03-アサインを作成する) | アサインを作成する | PR-E |
| [UC-04](docs/use-cases.md#uc-04-アサインの期間を変更する-ドラッグ--リサイズ) | アサインの期間を変更する (ドラッグ / リサイズ) | PR-F |
| [UC-05](docs/use-cases.md#uc-05-アサインを削除する) | アサインを削除する | PR-G |
| [UC-06](docs/use-cases.md#uc-06-人--案件を削除する-cascade) | 人 / 案件を削除する (cascade) | PR-H |

新機能を追加するときは [`.github/ISSUE_TEMPLATE/feature.yml`](.github/ISSUE_TEMPLATE/feature.yml) を使う。
ADR / use-case / 型定義の追加が AC に含まれる。

## 関連リポジトリ

- [tommykey-apps/ui-components](https://github.com/tommykey-apps/ui-components) — Svelte コンポーネントライブラリ
