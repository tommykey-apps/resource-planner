# 0012. Assignment の SK を安定キー化し version 楽観ロックで同時編集を扱う

- **Status**: Accepted
- **Date**: 2026-05-28
- **Deciders**: tommykey0925

## Context

帯 (Assignment) を連続してドラッグ / リサイズするとエラーになる、という報告が起点。

根本原因は **`startDate` を SK (`ASN#{startDate}#{id}`) に埋めていた**こと。startDate を変える操作 (移動・左端リサイズ) のたびに SK が変わるため、`updateAssignment` は「旧 SK を `attribute_exists` 条件付き Delete + 新 SK を `attribute_not_exists` 条件付き Put」という `TransactWriteItems` になっていた。

- クライアントは楽観 UI の PATCH を直列化せず投げ、変更前 startDate (`prevStartDate`) を条件再構築に使っていた。リクエストが重なると `attribute_exists(旧SK)` を満たせず `TransactionCanceledException` → 500 → revert + toast。
- さらに **複数人同時編集**が現実にあり、A が動かして旧 SK が消えると B の正当な編集まで条件失敗で壊れる。

AWS 公式の指針:
- 単発 `UpdateItem`/`PutItem` は並行でも atomic。read-modify-write のときだけロックが要る。
- **頻繁に更新される属性を sort key に入れない** (キーは immutable、更新に delete+put が必要)。
- read-modify-write の競合は **version 属性 + 条件付き書き込み (optimistic locking)** で検出する。

調査の結果、assignment への**日付 range query は実装されておらず** (`queryAllByTeam` が `pk` で全件取得、startDate は SK の並び順にしか使われていない)、startDate を SK から外しても既存クエリは壊れず GSI も不要と確認した。並び替えは client (`assignments/+page.svelte`) の責務。

## Decision

1. **B: SK を `ASN#{id}` 安定キーにする。** `startDate` は通常属性に降格。update が単一の atomic `PutCommand` になり、`TransactWrite` / SK rename レースが消える。
2. **C: `version` 属性 + 条件付き書き込みで楽観ロックする。** create で `version=1`、update は `ConditionExpression: attribute_exists(sk) AND version = :expected` で書き込み version を +1。不一致 (他ユーザが先に更新) は `ConditionalCheckFailedException` → `AssignmentVersionConflictError` → API は **409 + 最新 item** を返し、client は最新を表示して自分の変更を破棄 + 通知する (lost update を可視化)。
3. **A (前提、別 PR): クライアントの PATCH を assignment id 単位で cancel-latest 直列化する** (`AbortController`)。自分の連続操作が自分の前の書き込みと version 競合する自己 409 を防ぐ。

`prevStartDate` (旧 SK 再構築用) は全経路から廃止し、`expectedVersion` に置き換える。delete は `id` のみで足りる。

## Consequences

### Positive

- 連続ドラッグ / リサイズでエラーが出なくなる (rename レースの消滅)。
- 複数人同時編集で lost update を検出・通知できる (last-write-wins の暗黙の上書きを防ぐ)。
- `updateAssignment` が単一 `PutCommand` になり、`TransactWrite` の分岐が消えてコードが単純化。
- インフラ変更不要 (`version` は非キー属性、SK 値変更のみ。GSI / Terraform 据え置き)。

### Negative

- **既存データ移行が必要** (旧 SK item を残すと update 時に重複が出る)。one-off スクリプト + 事前バックアップで対応 (下記 References / runbook)。
- DB の物理順が startDate 順でなくなる (ULID 順)。client 側ソート前提なので実害はないが、将来 DB 側で期間 range query を足すなら **GSI 新設が必要**。
- 自分の高速連続ドラッグで、前の PATCH が abort 前に server commit 済だと稀に自己 409 (= 競合 toast) が出る。cancel-latest で頻度は小さく、挙動は安全 (データ破損なし)。

### Neutral

- 編集ダイアログ (form action) も `expectedVersion` を送り、競合は `fail(409, { conflict })` で通知する。

## Alternatives considered

- **last-write-wins (version なし)**: 実装は最小だが、複数人同時編集で他人の変更を黙って上書きする。本番・多人数のため不採用。
- **SK に startDate を残したまま条件を緩める**: rename の本質的な脆さ (delete+put 2 SK) が残り、version 楽観ロックも載せにくい。不採用。
- **DynamoDB Streams + WebSocket で即時反映**: 競合検出ではなく live 同期の話で別スコープ。今回は検出 + 通知 + 手動 refresh に留める。

## References

- [Best practices for handling concurrent updates in DynamoDB (AWS)](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/BestPractices_ImplementingVersionControl.html)
- [Optimistic locking with version number (AWS)](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/BestPractices_OptimisticLocking.html)
- [Best practices for using sort keys (AWS)](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-sort-keys.html)
- 移行 runbook: `web/scripts/migrate-assignment-keys.mjs` (forward / `--rollback` / `--dry-run`)。実行前に必ず `aws dynamodb create-backup` でオンデマンドバックアップを取得する。
- 関連: ADR 0004 (endDateExclusive), ADR 0005 (drag transport — 本 ADR で expectedVersion / 409 を追補)
