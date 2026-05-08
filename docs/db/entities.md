# Entities

DynamoDB シングルテーブル `resource-planner` には 3 種類のエンティティが格納される。
全アイテムは `pk = ORG#{clerk_org_id}` で組織ごとにパーティション分割され、
`sk` のプレフィックスで entity 種別を表現する。

> **Note**: 現時点で app 側の DB アクセスコード (CRUD 実装) は未着手。本ファイルは
> 将来 entity を実装するときの設計仕様として参照する。実装が入ったら各 entity の
> Source 列に Go / TypeScript の関数リンクを追記する。

## マルチテナント分離

- **PK = `ORG#{clerk_org_id}`**: Clerk Organization ID をそのまま埋め込む。
  全 entity 共通のため、1 query で組織内全データ取得 (Scan 不要) が可能。
- **クロステナント混入防止**: app 層で常に Clerk session の `orgId` から PK を組み立て、
  client 入力をそのまま PK に使わない。

## Entity 一覧

| Entity | SK パターン | 用途 |
|---|---|---|
| [Resource](#resource) | `RES#{resource_id}` | リソース (人/メンバー) |
| [Project](#project) | `PRJ#{project_id}` | 案件 (クライアント / 仕事) |
| [Assignment](#assignment) | `ASN#{start_date}#{assignment_id}` | 期間内のリソース → 案件アサイン |

---

## Resource

人 (メンバー) を表す。各組織内でユニーク。

- **PK**: `ORG#{clerk_org_id}`
- **SK**: `RES#{resource_id}`

| Field | Type | 説明 |
|---|---|---|
| `id` | str (UUID 想定) | resource の主キー (sk と内部 attribute の二重保持) |
| `name` | str | 表示名 |

サンプルアイテム:
```json
{
  "pk": "ORG#org_3DEYkgBkwFejVmc70EcFH3CgebQ",
  "sk": "RES#01HXYZ...",
  "id": "01HXYZ...",
  "name": "山田 太郎"
}
```

---

## Project

案件 (クライアント) を表す。

- **PK**: `ORG#{clerk_org_id}`
- **SK**: `PRJ#{project_id}`

| Field | Type | 説明 |
|---|---|---|
| `id` | str (UUID 想定) | project の主キー |
| `name` | str | プロジェクト名 |
| `color` | str (`#RRGGBB`) | タイムラインでの表示色 |

サンプルアイテム:
```json
{
  "pk": "ORG#org_3DEYkgBkwFejVmc70EcFH3CgebQ",
  "sk": "PRJ#01HABC...",
  "id": "01HABC...",
  "name": "Acme 移行案件",
  "color": "#4D72F3"
}
```

---

## Assignment

「いつ・誰を・どの案件に」割り当てたかを表す関連 entity。

- **PK**: `ORG#{clerk_org_id}`
- **SK**: `ASN#{start_date}#{assignment_id}`
  (`start_date` を SK 先頭に置くことで時系列 begins_with / between クエリを可能にする)

| Field | Type | 説明 |
|---|---|---|
| `id` | str (ULID) | assignment の主キー |
| `resourceId` | str | 紐づく [Resource](#resource) の `id` (FK 制約は DDB に無い) |
| `projectId` | str | 紐づく [Project](#project) の `id` (FK 制約は DDB に無い) |
| `startDate` | str (`YYYY-MM-DD`) | アサイン開始日 (**inclusive、この日を含む**)。SK にも埋め込む |
| `endDateExclusive` | str (`YYYY-MM-DD`) | アサイン終了日の翌日 (**exclusive、この日は含まない**)。半開区間 `[startDate, endDateExclusive)` (ADR 0004) |

> **endDateExclusive の解釈**: 「5/1〜5/31 のアサイン」 = `startDate=2026-05-01`, `endDateExclusive=2026-06-01`。最終作業日 (5/31) ではなく、その翌日 (6/1) を保存する。RFC 5545 / Google Calendar API / PostgreSQL daterange と同じ規約。

サンプルアイテム (2026-05-01 〜 2026-05-31 のアサイン):
```json
{
  "pk": "ORG#org_3DEYkgBkwFejVmc70EcFH3CgebQ",
  "sk": "ASN#2026-05-01#01HDEF...",
  "id": "01HDEF...",
  "resourceId": "01HXYZ...",
  "projectId": "01HABC...",
  "startDate": "2026-05-01",
  "endDateExclusive": "2026-06-01"
}
```

---

## 設計意図

- **Single Table Design**: 1 query で組織内全データ取得を効率的にしたい (リソース計画 UI は組織全体を一度に表示するユースケース)。Resource / Project / Assignment を別テーブルに分けると 3 回の query / Scan が必要になる
- **`pk = ORG#...` で固定**: マルチテナント isolation を物理的に強制 (PK が違えば物理的に到達不能)
- **`ASN` の SK 先頭に `start_date`**: 期間検索 `begins_with(sk, "ASN#2026-05")` や `BETWEEN` クエリで対応できる。`endDateExclusive` は条件式 (FilterExpression) で post-filter
- **半開区間 `[start, end)` 規約**: 業界標準 (RFC 5545 / Google Calendar / PostgreSQL daterange / Java / Rust / Python) に整合。隣接区間 (5/1〜5/3 と 5/3〜5/5) が境界で接して重ならない。詳細 [ADR 0004](../adr/0004-end-date-exclusive-with-form-transform.md)
- **FK 整合性は app 層で担保**: DynamoDB は外部キー制約を持たないため、Resource / Project の delete 時に Assignment を残骸として残さないようカスケード削除を app 層で実装する (将来要件)
