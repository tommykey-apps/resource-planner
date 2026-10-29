# Access Patterns

resource-planner の DynamoDB 単一テーブルに対するクエリパターン一覧。
**前提**: app 層は常に Auth.js session から `teamId` を取得し、PK を `TEAM#{teamId}` で固定する。

> **Note**: 下表の API はいずれも `web/src/lib/repository/` 配下に実装済み。
> 関数名は実装と対応する (例: `listResources` / `createAssignment` / `deleteResource`)。

## 一覧

| # | Use case | API | KeyCondition | Filter / Condition | 備考 |
|---|---|---|---|---|---|
| 1 | 組織内全データ取得 (タイムライン初期表示) | `load(teamId)` (SvelteKit `+page.server.ts`) | `pk = TEAM#{teamId}` (Query) | なし | Resource / Project / Assignment が 1 query で混在取得。app 層で SK プレフィックスを見て振り分ける |
| 2 | リソース一覧 | `listResources(teamId)` | `pk = TEAM#{teamId} AND begins_with(sk, "RES#")` | なし | 組織内の人を全件 |
| 3 | 案件一覧 | `listProjects(teamId)` | `pk = TEAM#{teamId} AND begins_with(sk, "PRJ#")` | なし | 組織内の案件を全件 |
| 4 | 期間内アサイン取得 (未実装) | — | — | — | **ADR 0012 で SK から startDate を外した**ため SK range (`BETWEEN`) では取得できない。 現状は UC#1 で team 全件取得し client 側で期間フィルタ + ソートする。 将来 DB 側で必要になったら startDate を載せた GSI を新設する |

## SK プレフィックスの境界

| Entity | SK 先頭プレフィックス |
|---|---|
| Resource | `RES#` |
| Project | `PRJ#` |
| Assignment | `ASN#` |

`R` < `P` ではなく `P` < `R` のため、辞書順は `ASN# < PRJ# < RES#` の順。`begins_with` で
個別取得するときは順序を意識する必要は無いが、将来 `BETWEEN "PRJ#" AND "RES#"` のような
複合範囲を組む場合はこの順序を考慮する。

## CRUD オペレーション

| # | Use case | API | Operation | ConditionExpression |
|---|---|---|---|---|
| 5 | リソース作成 | `createResource(teamId, name)` | `PutItem` | `attribute_not_exists(sk)` で同一 SK の上書き防止 |
| 6 | 案件作成 | `createProject(teamId, name, color)` | `PutItem` | `attribute_not_exists(sk)` |
| 7 | アサイン作成 | `createAssignment(teamId, payload)` | `PutItem` | SK=`ASN#{id}`、 `attribute_not_exists(sk)` + `version=1`。フォーム入力 (inclusive `endDate`) → `assignmentCreateSchema.transform()` → `endDateExclusive` ([ADR 0004](../adr/0004-end-date-exclusive-with-form-transform.md)) |
| 7b | アサイン更新 | `updateAssignment(teamId, payload)` | `PutItem` | SK=`ASN#{id}` 安定キーへ単一 atomic Put。 `attribute_exists(sk) AND version = :expected` で楽観ロック、 version +1。 不一致は `AssignmentVersionConflictError` → API 409 ([ADR 0012](../adr/0012-assignment-stable-key-and-optimistic-locking.md)) |
| 8 | アサイン削除 | `deleteAssignment(teamId, id)` | `DeleteItem` | SK=`ASN#{id}`。 なし (idempotent) |
| 9 | リソース削除 + カスケード | `deleteResource(teamId, resourceId)` | `TransactWriteItems` (Resource 1 件 + 関連 Assignment 複数) | app 層で先に `listAssignments(...)` で対象 SK を集める |
| 10 | 部署作成 | `createDepartment(teamId, { name, parentId? })` | `PutItem` | SK=`DEPT#{id}`、 `attribute_not_exists(sk)`。 ルートは `parentId` 属性なし (adjacency list、 [ADR 0013](../adr/0013-department-grouping-tree.md))。 作成前に `listDepartments` で **親存在 + 兄弟名一意** を検証。 一覧は UC #1 (`queryAllByTeam`) に同梱、 ツリーは in-memory 構築 |
| 10b | 部署の付け替え | `moveDepartment(teamId, id, newParentId)` | `UpdateItem` | `listDepartments` を読んで **循環 (自分/子孫を親に) と兄弟名衝突を in-memory 検証** → `SET parentId` / ルート化は `REMOVE parentId` (`attribute_exists(sk)`)。 違反は `DepartmentTreeError` → form action が 400 (#240) |
| 10d | 部署名の変更 | `renameDepartment(teamId, id, name)` | `UpdateItem` | `listDepartments` を読んで **対象存在 + 兄弟名一意 (自分自身は除外)** を in-memory 検証 → `SET #name` (`attribute_exists(sk)`)。 Resource は `departmentId` で参照するので他 item は書き換えない。 違反は `DepartmentTreeError` → form action が 400 (#250) |
| 10c | 部署削除 (繰り上げ) | `deleteDepartment(teamId, id)` | `TransactWriteItems` (子 Department + 所属 Resource の reparent + 本体 Delete) | **ADR 0006 のカスケードとは逆**: 配下を消さず**親へ繰り上げ**る。 子 Department の `parentId` と所属 Resource の `departmentId` を削除ノードの親へ (`SET` / ルート削除なら `REMOVE`)、 最後に本体を `attribute_exists(sk)` 付き Delete。 所属 Resource は `begins_with(sk,"RES#")` + `FilterExpression departmentId=:v` で取得。 100 items 超は throw。 Assignment は department 参照なしで無関係 (#241、 [ADR 0013](../adr/0013-department-grouping-tree.md)) |

## Anti-patterns / Known concerns

### A1. クロステナント混入防止
PK を **必ず** server-side で組み立てる。session の `teamId` 以外を信用しない。
HTTP body / query で `teamId` を受け取って PK にするのは禁止 (権限昇格の経路になる)。

### A2. Scan は使わない
Single Table Design の利点は全 query が PK 固定で完結すること。Scan は組織分離を破壊する
ため (別 org のデータを引きうる) 採用しない。集計が必要なら GSI を新設する。

### A3. Assignment の FK 整合性
DynamoDB は FK 制約が無い。Resource / Project を削除しても Assignment は残骸として残る。
**app 層で `TransactWriteItems` または step-by-step delete を実装** して整合性を担保する
(use case #9 参照)。

### A4. Assignment の SK と楽観ロック (ADR 0012)
SK は `ASN#{assignment_id}` の**安定キー** (ULID なので衝突しない)。 旧 `ASN#{start_date}#{id}` は
startDate 変更のたびに SK rename (delete+put) が必要で、 連続操作・同時編集で `TransactionCanceledException`
を起こしていたため廃止した。 update は単一 atomic `PutItem` + `version` 楽観ロック
(`attribute_exists(sk) AND version = :expected`) で同時編集の lost update を検出する。
`create` の `attribute_not_exists(sk)` は ULID 衝突に対する念のための保険。
