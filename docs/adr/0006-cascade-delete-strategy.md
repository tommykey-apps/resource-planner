# 0006. Resource / Project の削除は関連 Assignment を TransactWriteItems で原子的に cascade delete する

- **Status**: Accepted
- **Date**: 2026-05-08
- **Deciders**: @tommykey0925

> **Note**: 本 ADR は当初 Clerk Organization (`pk = ORG#X`) を前提に書かれた。 ADR 0009 で multi-tenant 単位を Clerk Org → 自前 Team モデルに再設計したため、 本文中の `orgId` / `ORG#` 表記は **`teamId` / `TEAM#`** と読み替えること。 cascade 戦略自体は不変。

## Context

Resource / Project を削除したとき、関連する Assignment をどう扱うかを決める必要がある。
DynamoDB は外部キー制約を持たないため、app 層で整合性を担保する (`docs/db/access-patterns.md` A3 参照)。

選択肢:

| 案 | 説明 | DB 整合性 | UX | 実装複雑度 |
|---|---|---|---|---|
| (A) **Cascade delete (TransactWriteItems で原子的)** | Resource + 関連 Assignment を 1 つの transaction で削除 | ✅ | ◎ (1 操作で完結) | 中 |
| (B) Block delete (関連 Assignment があれば 409) | 「先に Assignment を削除してください」 | ✅ | △ (手作業多い) | 小 |
| (C) Orphan 許容 (Resource だけ削除、Assignment は残す) | UI 表示時に projectId が見つからない Assignment を非表示 | ❌ ゴミデータ蓄積 | △ (見えないデータが残る) | 小 |
| (D) BatchWriteItem で eventually consistent cascade | 25 件ずつ chunk、途中失敗でゴミ残る可能性 | △ | ◎ | 中 |

## Decision

**(A) Cascade delete を採用。** Resource と関連 Assignment、または Project と関連 Assignment を 1 つの `TransactWriteItems` で原子的に削除する。

### 実装詳細

**`web/src/lib/repository/resource.ts` の `deleteResource(teamId, id)`** (Project 側も同様):

1. `Query(pk = TEAM#X AND begins_with(sk, "ASN#"))` + `FilterExpression: resourceId == id` で関連 Assignment の SK 一覧を取得 (pagination 対応)
2. `TransactWriteItems` で:
   - Resource 自身の Delete (`pk=TEAM#X, sk=RES#id`)
   - 各関連 Assignment の Delete (`pk=TEAM#X, sk=ASN#date#id`)
3. **TransactWriteItems の制限 100 items**。total が 100 を超えたら `Error('cascade delete exceeds 100 items')` を throw

### UX

ResourceManager / ProjectManager の各行に「(N 件のアサイン)」と関連件数を表示。削除ボタン押下時の `confirm()` ダイアログで:

```
「{name}」と関連 {N} 件のアサインを削除しますか?
(取り消しできません)
```

関連 0 件なら従来どおり「{name} を削除しますか?」のみ。

### 100 件超のフォールバックは未実装

100 件超のフォールバック (BatchWriteItem chunk 化) は **YAGNI** として未実装。理由:

- 社内 100 ユーザー / 月単位アサインの想定で、1 リソースが 100 件以上の Assignment を持つ運用は非現実的 (毎日異なる案件にアサインされても 3 ヶ月分)
- 100 件超で本当に発生したら、その時点で別 ADR で BatchWriteItem 採用を検討
- BatchWriteItem は atomicity がないため、失敗時の中途半端な状態を考えると現状 throw のほうが扱いやすい

## Consequences

### Positive

- **DB 整合性**: orphan データが発生しない
- **UX**: 1 回のクリック + confirm で完結、Assignment を先に削除する手作業が要らない
- **Atomicity**: 全削除 or 全保留、中途半端な状態にならない (TransactWriteItems の保証)
- **件数透明化**: UI で事前に「N 件削除されます」が見える、ユーザーが意思決定しやすい
- **シンプル**: BatchWriteItem の chunk / リトライロジック等が不要

### Negative

- **100 件超で throw**: ユーザーには「件数オーバーで削除できなかった」エラーが見える。フォールバック未実装のため手動で先に Assignment を削除する必要がある (発生確率低)
- **Query で全 Assignment を走査して filter**: 該当 resourceId / projectId 以外の Assignment も Read される (RCU 消費)。組織内 Assignment が膨大になると RCU コスト増。社内ツール規模では問題なし、SaaS 化したら GSI 追加検討
- **取り消し不可**: 確認モーダルを通過したら復元手段なし。誤操作対策は confirm() のみ
- **削除中に同時編集が起きるとどうなるか**: TransactWriteItems は ConditionCheck 不使用のため、同時に Assignment が追加されても見落とす (新 Assignment は orphan 化)。実害低、社内ユーザー数少なければ稀

### Neutral

- IAM 権限: `TransactWriteItems` API は内部的に `dynamodb:DeleteItem` 権限を要求 (per-operation evaluate)。Lambda IAM role に既に付与済 (`infra/lambda.tf` の `lambda_dynamodb` policy)。**追加 IAM 変更不要**

## Alternatives considered

- **(B) Block delete**: 安全だが UX rigid。社内ツールでは「とりあえず削除させて」のニーズが強い
- **(C) Orphan 許容**: 既存 PR-C/D の挙動 (PR-H 前)。ゴミが見えない分、長期的にデータ品質が劣化する。UC-03 sequence 中の「resource/project が同時刻に削除されていた」エッジケースもこれで防げる
- **(D) BatchWriteItem fallback**: atomicity 失われ、中途半端状態のリカバリが面倒。100 件超ケースが現実化したら別 ADR で検討
- **(E) ソフトデリート (`deleted_at` フラグ)**: ゴミデータは残るが復元可能。要件に対し over-engineering、ストレージコストも増

## Implementation notes

- `web/src/lib/repository/resource.ts`: `deleteResource` を cascade に変更 + `queryRelatedAssignmentSkByResource` private helper 追加
- `web/src/lib/repository/project.ts`: `deleteProject` 同様
- `web/src/lib/components/ResourceManager.svelte` / `ProjectManager.svelte`: `assignments` prop 受け取り、`assignmentCountByResource` / `assignmentCountByProject` の `$derived` Map で各 entity の count 計算、UI に件数表示 + confirm メッセージ更新
- `web/src/routes/+page.svelte`: ResourceManager / ProjectManager に `assignments={dbAssignments}` を渡す

`+page.server.ts` の form action は変更不要 — repository の `deleteResource` / `deleteProject` がそのまま cascade 動作になるため、呼び出しシグネチャ互換。

## References

- [DynamoDB TransactWriteItems API](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html)
- [DynamoDB transaction limits](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)
- [`docs/db/access-patterns.md` A3 (FK 整合性)](../db/access-patterns.md)
- [ADR 0005 (drag/resize transport、idempotent delete の議論)](0005-assignment-drag-resize-transport.md)
- 関連 issue: #TBD (本コミット直後に作成)
