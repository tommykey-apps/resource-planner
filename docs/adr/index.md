# Architecture Decision Records

resource-planner の設計判断を Michael Nygard 形式で記録する。
詳細な運用ポリシーは [`README.md`](README.md) 参照。

## 一覧

| # | タイトル | Status | 日付 |
|---|---|---|---|
| [0001](0001-typescript-types-as-api-spec.md) | TypeScript 型を API 仕様の正本とする | Accepted | 2026-05-08 |
| [0002](0002-id-generation-with-ulid.md) | ID 生成戦略を ULID に統一する | Accepted | 2026-05-08 |
| [0003](0003-end-date-inclusive-storage.md) | endDate は inclusive で保存する | **Superseded by 0004** | 2026-05-08 |
| [0004](0004-end-date-exclusive-with-form-transform.md) | endDate は exclusive 半開区間 + フォーム境界で Zod transform | Accepted | 2026-05-08 |
| [0005](0005-assignment-drag-resize-transport.md) | Assignment ドラッグ / リサイズは `+server.ts` API + Optimistic UI | Accepted | 2026-05-08 |
| [0006](0006-cascade-delete-strategy.md) | Resource / Project の削除は cascade (TransactWriteItems) | Accepted | 2026-05-08 |
| [0007](0007-tdd-with-vitest-and-playwright.md) | TDD で開発する: Vitest + Playwright | Accepted | 2026-05-09 |
| [0008](0008-auth-migration-clerk-to-authjs.md) | 認証を Clerk → Auth.js + Email Magic Link に移行する | Accepted | 2026-05-09 |
| [0009](0009-org-to-team-redesign.md) | マルチテナント単位を Clerk Org → 自前 Team モデルに再設計する | Accepted | 2026-05-09 |
| [0010](0010-project-metadata.md) | Project に詳細情報 (description / tags / links) を同 item 内 attribute で追加する | Accepted | 2026-05-13 |

## テンプレ

新規 ADR を起こすときは [`template.md`](template.md) をコピーして `NNNN-kebab-case-title.md` で作成する。

## ステータス遷移

```
Proposed → Accepted → (Deprecated | Superseded by NNNN)
```

詳細な運用は [`README.md`](README.md) 参照。
