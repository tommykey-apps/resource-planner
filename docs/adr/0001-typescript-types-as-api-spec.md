# 0001. TypeScript 型を API 仕様の正本とする

- **Status**: Accepted
- **Date**: 2026-05-08
- **Deciders**: @tommykey0925

## Context

resource-planner は SvelteKit (`+page.server.ts` の load + form actions) で SSR + サーバーサイド処理を完結させる **内部 RPC スタイル** のアプリ。外部公開する REST / GraphQL API は持たない。

この構成で「アプリの基本設計 / API 仕様」をどう文書化するかを決めたい。選択肢:

- (A) **OpenAPI** を採用し、SvelteKit form actions も「内部 API」として仕様書を書く
- (B) **TypeScript 型 + Zod/Valibot schema** を仕様の正本にし、自然言語ドキュメントは Mermaid sequence (`docs/use-cases.md`) と ADR で補完する

業界調査 (SvelteKit / Remix / Next.js Server Actions / tRPC 文化) では、内部 RPC アプリでは **(B) 型駆動** が多数派という結論。理由:

- OpenAPI は HTTP request/response の **外部契約** を記述するモデル。SvelteKit form actions は `multipart/form-data` POST + `ActionFailure` or redirect という SvelteKit ランタイム前提のセマンティクスで、HTTP レイヤを直接設計するモデルではない
- OpenAPI の主要メリット (typed SDK 生成 → 別言語クライアントへ配布) は、TS 単一言語 / 公開 API なし の本アプリでは活きない
- スキーマ定義 + コード + コード生成ステップを全廃し、TS 型推論を **単一情報源** にしたほうが DRY、ドリフト防止になる (tRPC 流派)

## Decision

**OpenAPI は採用しない。** API 仕様の正本は以下とする:

1. **TypeScript 型** (`web/src/lib/types.ts` 想定) — request/response の型定義
2. **Zod / Valibot schema** — 実行時検証も兼ねる仕様 (form action の入力バリデーション)
3. **`docs/use-cases.md`** — Mermaid sequence diagram で動的振る舞いを記述
4. **`docs/adr/`** — 判断の経緯を残す
5. **`docs/architecture.drawio`** — Container 図 (C4 model 準拠)
6. **`docs/db/`** — データモデル仕様 (tbls 自動生成 + 手書き entities/access-patterns)

## Consequences

### Positive

- **DRY**: 型 = 仕様。注釈や手書き OpenAPI を二重管理しない
- **ドリフト不可**: TS コンパイラが型と実装の不整合を検出。`pnpm check` で半自動検証
- **学習コスト最小**: SvelteKit の標準パターンに乗る。新規メンバーが Svelte/TS だけ覚えれば良い
- **runtime + compile-time 両対応**: Zod/Valibot で実行時の入力検証も同じ schema でカバー

### Negative

- **外部 API 公開時は別途対応が必要**: 将来 SaaS 化や別言語クライアント要件が出たら、API gateway 層に OpenAPI を後付けする (現時点では先払いコストのほうが大きい)
- **言語境界を超えて型を共有できない**: TS 単一言語前提。別言語の client が直接型を読めない
- **stakeholder 向けの綺麗な API ドキュメント (Swagger UI 風) が無い**: 必要になったら ADR を更新して採用判断する

### Neutral

- ADR + Mermaid + 型 の 3 本柱を **メンテし続ける** 文化的コミットメントが必要。型は IDE が守るが、ADR / use-cases.md は手動更新。issue テンプレで AC 化することで運用コストを下げる (#31 参照)

## Alternatives considered

- **OpenAPI 採用 (案 A)**: 上記 Context 通り、内部 RPC モデルとセマンティクスが噛み合わない。形だけ書いても消費者がいない
- **JSDoc / TypeDoc を主軸**: TypeDoc は型を docs 化するが、生成 docs を読む文化が小規模チームでは定着しにくい。型そのものを読ませるほうが直接的
- **Schema-first (Zod だけで完結)**: Zod schema から型を `z.infer<>` するパターンは検討した。本 ADR と矛盾しないため、各 entity ごとに採用可 (ADR レベルでは固定しない)

## References

- [SvelteKit form actions discussion #9717](https://github.com/sveltejs/kit/discussions/9717) — OpenAPI と form actions の不整合議論
- [tRPC - Move Fast and Break Nothing](https://trpc.io/) — 型 = ドキュメント哲学
- [Type-Driven HTTP: tRPC vs OpenAPI vs RPC (Medium)](https://medium.com/@2nick2patel2/type-driven-http-trpc-vs-openapi-vs-rpc-714ab8ba2764)
- [How to Document Architectural Decisions: ADRs and the C4 Model - Vijay Anant](https://vijayanant.com/posts/from-patterns-to-practice/documenting-your-decision/) — ADR + C4 の組み合わせ推奨
- [architecture-decision-record (joelparkerhenderson)](https://github.com/joelparkerhenderson/architecture-decision-record) — Nygard テンプレ参照実装
- 関連 issue: [#31](https://github.com/tommykey-apps/resource-planner/issues/31)
