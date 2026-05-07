# Access Patterns

resource-planner の DynamoDB 単一テーブルに対するクエリパターン一覧。
**前提**: app 層は常に Clerk session から `orgId` を取得し、PK を `ORG#{orgId}` で固定する。

> **Note**: 現時点で app 側の DB アクセスコードは未着手。本表は将来 CRUD を実装する際の
> 設計仕様。実装が入ったら "API" / "Source" 列に handler / repository への行番号リンクを
> 追記する (TODO)。

## 一覧

| # | Use case | API (将来予定) | KeyCondition | Filter / Condition | 備考 |
|---|---|---|---|---|---|
| 1 | 組織内全データ取得 (タイムライン初期表示) | `load(orgId)` (SvelteKit `+page.server.ts`) | `pk = ORG#{orgId}` (Query) | なし | Resource / Project / Assignment が 1 query で混在取得。app 層で SK プレフィックスを見て振り分ける |
| 2 | リソース一覧 | `listResources(orgId)` | `pk = ORG#{orgId} AND begins_with(sk, "RES#")` | なし | 組織内の人を全件 |
| 3 | 案件一覧 | `listProjects(orgId)` | `pk = ORG#{orgId} AND begins_with(sk, "PRJ#")` | なし | 組織内の案件を全件 |
| 4 | 期間内アサイン取得 | `listAssignments(orgId, from, to)` | `pk = ORG#{orgId} AND sk BETWEEN "ASN#{from}" AND "ASN#{to}~"` | `endDate >= :from` (FilterExpression、開始日が範囲内でも end が範囲外のものを除く場合) | `~` (チルダ、ASCII 7E) は ASCII 上で `#` より大きいので range 終端の sentinel として有効 |

## SK プレフィックスの境界

| Entity | SK 先頭プレフィックス |
|---|---|
| Resource | `RES#` |
| Project | `PRJ#` |
| Assignment | `ASN#` |

`R` < `P` ではなく `P` < `R` のため、辞書順は `ASN# < PRJ# < RES#` の順。`begins_with` で
個別取得するときは順序を意識する必要は無いが、将来 `BETWEEN "PRJ#" AND "RES#"` のような
複合範囲を組む場合はこの順序を考慮する。

## CRUD オペレーション (将来実装)

| # | Use case | API | Operation | ConditionExpression |
|---|---|---|---|---|
| 5 | リソース作成 | `createResource(orgId, name)` | `PutItem` | `attribute_not_exists(sk)` で同一 SK の上書き防止 |
| 6 | 案件作成 | `createProject(orgId, name, color)` | `PutItem` | `attribute_not_exists(sk)` |
| 7 | アサイン作成 | `createAssignment(orgId, resourceId, projectId, startDate, endDate)` | `PutItem` | `attribute_not_exists(sk)` |
| 8 | アサイン削除 | `deleteAssignment(orgId, sk)` | `DeleteItem` | なし (idempotent) |
| 9 | リソース削除 + カスケード | `deleteResource(orgId, resourceId)` | `TransactWriteItems` (Resource 1 件 + 関連 Assignment 複数) | app 層で先に `listAssignments(...)` で対象 SK を集める |

## Anti-patterns / Known concerns

### A1. クロステナント混入防止
PK を **必ず** server-side で組み立てる。Clerk session の `orgId` 以外を信用しない。
HTTP body / query で `orgId` を受け取って PK にするのは禁止 (権限昇格の経路になる)。

### A2. Scan は使わない
Single Table Design の利点は全 query が PK 固定で完結すること。Scan は組織分離を破壊する
ため (別 org のデータを引きうる) 採用しない。集計が必要なら GSI を新設する。

### A3. Assignment の FK 整合性
DynamoDB は FK 制約が無い。Resource / Project を削除しても Assignment は残骸として残る。
**app 層で `TransactWriteItems` または step-by-step delete を実装** して整合性を担保する
(use case #9 参照)。

### A4. Assignment の SK ユニーク性
SK は `ASN#{start_date}#{assignment_id}` の複合。`assignment_id` (UUID) が末尾にあるため
同一 `start_date` の同時アサインも問題なく作成可能。`attribute_not_exists(sk)` の防御は
UUID 衝突に対する念のための保険。
