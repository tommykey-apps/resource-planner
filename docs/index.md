# resource-planner — 設計ドキュメント

要員計画アプリ resource-planner の設計ドキュメント集。
[ADR 0001](adr/0001-typescript-types-as-api-spec.md) で **OpenAPI 不採用 + 型駆動 docs 戦略** を採用しており、ドキュメントは「役割で分割」している。

## ドキュメントの読み方

| 何が知りたい | どこを見る |
|---|---|
| **構造** (どのコンポーネントがどう繋がっているか) | [`architecture.png`](architecture.png) — C4 Container 図 |
| **なぜ** その判断をしたか | [`adr/`](adr/) — Architecture Decision Records (Michael Nygard 形式) |
| **どう動く** か (画面 → action → DB の流れ) | [`use-cases.md`](use-cases.md) — Mermaid sequence diagrams |
| **データモデル** (PK / SK / 属性 / クエリパターン) | [`db/`](db/) — tbls 自動生成 + 手書き entities/access-patterns |
| **API 仕様** (関数の入出力) | TypeScript 型 ([`web/src/lib/types.ts`](https://github.com/tommykey-apps/resource-planner/blob/main/web/src/lib/types.ts)、Zod schema) — リポジトリ内のコードを直接読む |

## アーキテクチャ図

![Architecture](architecture.png)

> [`architecture.drawio`](https://github.com/tommykey-apps/resource-planner/blob/main/docs/architecture.drawio) を draw.io で開くと編集できる。
> 図を更新したら `drawio-png` skill (またはローカル draw.io GUI) で `architecture.png` を再 export して commit する。

## クイックリンク

- [Architecture Decision Records (ADR 一覧)](adr/)
- [Use Cases (UC-01 〜 UC-06)](use-cases.md)
- [DB Schema (entities, access patterns, tbls 自動生成)](db/)
- [GitHub Repository](https://github.com/tommykey-apps/resource-planner)

## アプリ本体

- 本番: <https://planner.tommykeyapp.com/>
- 認証: Clerk (Microsoft Social Connection、`@your-company.example.com` ドメイン制限)

## 開発フロー

新機能を追加するときは [`.github/ISSUE_TEMPLATE/feature.yml`](https://github.com/tommykey-apps/resource-planner/blob/main/.github/ISSUE_TEMPLATE/feature.yml) を使って起票する。AC に「ADR 追加 / use-case Mermaid / TypeScript 型定義」の項目があり、本ドキュメント体系を維持する仕組みになっている。
