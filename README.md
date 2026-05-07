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
| Adapter | `@sveltejs/adapter-static` | 3 |
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

```bash
pnpm install               # 依存インストール
pnpm dev                   # Vite dev server
pnpm build                 # ビルド (build/ に静的サイト出力)
pnpm preview               # 本番ビルドのプレビュー
pnpm check                 # svelte-check
pnpm lint                  # ESLint + Prettier
pnpm format                # Prettier 自動修正
```

## アーキテクチャ

![Architecture](docs/architecture.png)

> [docs/architecture.drawio](docs/architecture.drawio) を draw.io で開くと編集できる。
> 図を更新したら `drawio-png` skill (またはローカル draw.io GUI) で `docs/architecture.png` を再 export して commit する。

## 設計ドキュメントの読み方

本リポジトリは **型駆動 docs 戦略** を採用している ([ADR 0001](docs/adr/0001-typescript-types-as-api-spec.md))。
OpenAPI は使わず、TypeScript 型 + Zod schema を API 仕様の正本とし、自然言語ドキュメントは
役割を分けて 4 箇所に集約する:

| 何が知りたい | どこを見る |
|---|---|
| **構造** (どのコンポーネントがどう繋がっているか) | [`docs/architecture.drawio`](docs/architecture.drawio) ([PNG](docs/architecture.png)) — C4 Container 図 |
| **なぜ** その判断をしたか | [`docs/adr/`](docs/adr/) — Architecture Decision Records (Michael Nygard 形式) |
| **どう動く** か (画面 → action → DB の流れ) | [`docs/use-cases.md`](docs/use-cases.md) — Mermaid sequence diagrams |
| **データモデル** (PK / SK / 属性 / クエリパターン) | [`docs/db/`](docs/db/) — tbls 自動生成 + 手書き entities/access-patterns ([Pages 公開](https://tommykey-apps.github.io/resource-planner/db/)) |
| **API 仕様** (関数の入出力) | TypeScript 型 (`web/src/lib/types.ts`, Zod schema) — コードを直接読む |

新機能を追加するときは [`.github/ISSUE_TEMPLATE/feature.yml`](.github/ISSUE_TEMPLATE/feature.yml) を使う。
ADR / use-case / 型定義の追加が AC に含まれる。

## 関連リポジトリ

- [tommykey-apps/ui-components](https://github.com/tommykey-apps/ui-components) — Svelte コンポーネントライブラリ
