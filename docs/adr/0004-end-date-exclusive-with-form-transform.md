# 0004. endDate は exclusive 半開区間で保存、フォーム境界で Zod transform で 1 箇所変換

- **Status**: Accepted
- **Date**: 2026-05-08
- **Deciders**: @tommykey0925
- **Supersedes**: [ADR 0003](0003-end-date-inclusive-storage.md)

## Context

ADR 0003 (現在 Superseded) では「全層 inclusive + ResourceTimeline 境界で `±1 day` 変換」を採用したが、業界標準調査の結果、**内部 exclusive 半開区間 `[start, end)`** が圧倒的に多数派と判明:

| 規格 / ライブラリ / API | 規約 |
|---|---|
| RFC 5545 (iCalendar) | DTEND は exclusive |
| Google Calendar API | `end.date` は exclusive (RFC 5545 準拠) |
| Outlook Calendar API | exclusive |
| PostgreSQL `daterange` | デフォルト `[)` (start inclusive, end exclusive) |
| Java `LocalDate.datesUntil` | end exclusive |
| Rust `Range<T>` (`..`) | exclusive |
| Python `range()` | exclusive |
| Bryntum Gantt | finish exclusive |
| DHTMLX Gantt | end exclusive |
| `@tommykey-apps/ui-components` ResourceTimeline | endDate exclusive |

Inclusive を採用した場合 (= 旧 ADR 0003)、ResourceTimeline / 将来の iCal/Google Calendar 連携 / PostgreSQL daterange と毎回 `±1 day` 変換が発生し、「変換ロジックがレイヤを跨いで散らばる」問題があった。

業界の優れた実装は **「内部 exclusive で統一 + フォーム widget 境界で UX inclusive を 1 箇所で翻訳」** という形 (Google Calendar、Outlook、Bryntum など)。これを採用すれば:
- ResourceTimeline、DB、API、Repository、SK 計算式すべてが半開区間で揃う (`±1 day` がコードに出ない)
- 変換は schema の `.transform()` 1 箇所のみ
- 隣接区間 (5/1〜5/3 と 5/3〜5/5) が境界で接して重ならない (philosophical overlap が消える)
- 将来の iCal/Google Calendar 連携時にゼロコスト

## Decision

**内部 exclusive 半開区間 `[startDate, endDateExclusive)` で統一。** 変換はフォーム境界の Zod `.transform()` のみ。

### 各レイヤの規約

| レイヤ | 規約 | 値の例 (5/1〜5/31 のアサイン) |
|---|---|---|
| **DB / API / Repository / Type** | exclusive `[start, end)` | `startDate=2026-05-01`, `endDateExclusive=2026-06-01` |
| **ResourceTimeline 渡し** (`Date` 型) | exclusive (規約一致) | adapter は型変換のみ、`±1 day` 不要 |
| **フォーム widget (`AssignmentCreator`)** | UX inclusive (label「終了日 (含む)」5/31) | ユーザーは引き続き 5/31 と入力 |
| **変換場所** | Zod `.transform()` の 1 箇所 | `addDays(input.endDate, 1)` |

### Type-level distinction

- `AssignmentCreateInput` = `z.input<typeof schema>`: フォーム生 shape (`endDate` inclusive)
- `AssignmentCreatePayload` = `z.output<typeof schema>`: post-transform shape (`endDateExclusive`)
- `Assignment` (`types.ts`): ストレージ shape (`endDateExclusive`)

これにより「どのレイヤで何の意味を持つか」が型システムで明示される。`endDate` を `endDateExclusive` に渡そうとするとコンパイルエラー。

### フィールド名

`endDate` ではなく **`endDateExclusive`** を採用。理由:
- フィールド名で意味が自明 (DB を素手で覗いたり、新しい開発者がコードを読んだとき誤読しない)
- Bryntum / FHIR / 一部の calendar API でも `Exclusive` suffix or `until` 命名を採用
- Google Calendar API の `end.date` 命名は曖昧で、外部開発者が `+1 day` 問題に頻繁に遭遇している教訓

## Consequences

### Positive

- **業界標準と整合**: RFC 5545 / Google Calendar / PostgreSQL daterange / Java / Rust / Python / Bryntum と同じ規約
- **コードに `±1 day` が出ない**: schema の `.transform()` の中だけ。app ロジック / repository / API / SK 計算式 / Mermaid sequence が `±1` フリー
- **隣接区間がきれい**: `[5/1, 5/3)` と `[5/3, 5/5)` は境界で接して重ならない (旧実装の philosophical overlap が消える)
- **将来の連携リスク減**: iCal / Google Calendar / Postgres daterange と統合する日が来てもゼロコスト
- **型レベルで誤用検知**: `endDateExclusive` フィールド名 + 別型 (`AssignmentCreateInput` vs `AssignmentCreatePayload`) でコンパイラが守る

### Negative

- **フォーム widget で `+1` 変換が必要**: 「終了日 5/31」を `endDateExclusive=2026-06-01` に翻訳する `.transform()` の 1 箇所
- **編集時 (PR-F 以降) は逆方向 `-1` も必要**: DB の `endDateExclusive` を「終了日 (含む)」表示に戻すヘルパが要る (1 関数)
- **DB の生データを覗くと「2026-06-01」と書かれていて、5 月のアサイン?と一瞬迷う**: フィールド名 `endDateExclusive` で防御。SQL/CLI で見たとき「次の日」と読める文化を作る

### Neutral

- 既存の inclusive データ (DDB Local の手動投入分) は table 再作成で破棄。本番投入前なので無コスト。本番運用後に同様の変更を行う場合は migration 必要

## Alternatives considered

- **(A) ADR 0003 のまま (inclusive 統一)**: 旧採用案。隣接が重なる philosophical overlap、adapter で ±1 day、業界標準と逆向き
- **(B) 全層 exclusive (フォームも exclusive 表示)**: 「解放日」「until」のような UX。変換ゼロだが日本語の用語として馴染まない、社内文化との衝突リスク
- **(C) Duration モデル (`startDate + days`)**: RFC 5545 の `DURATION` 採用例。`endDate` 概念を捨てる。「5 月末までに終わるもの」のクエリで都度計算が必要
- **(D) DB inclusive、フォーム inclusive、(timeline 境界で adapter 変換) = ADR 0003 のまま**: 上記 (A) と同じ

採用案は **「内部 exclusive + UX inclusive、変換は schema.transform 1 箇所」** で、(A)〜(D) の良いとこ取り。

## Implementation notes

実装 PR の主な変更:
- `web/src/lib/date.ts` (新規): `parseLocalDate` / `formatLocalDate` / `addDays` の純粋関数
- `web/src/lib/types.ts`: `Assignment.endDate` → `endDateExclusive`
- `web/src/lib/schemas/index.ts`: `assignmentCreateSchema` / `assignmentUpdateSchema` に `.transform()` 追加
- `web/src/lib/repository/assignment.ts`: 引数型 `AssignmentCreatePayload`、DB attr `endDateExclusive`
- `web/src/lib/timeline-adapter.ts`: `±1 day` 削除、純粋な型変換のみ
- `docs/db/entities.md` / `docs/db/access-patterns.md` / `docs/use-cases.md` UC-03: 表記書き換え

フォーム (`AssignmentCreator.svelte`) は **無変更** — `<input name="endDate">` のまま。submit 時に Zod が `.transform()` で `endDateExclusive` に変換する。

## References

- [RFC 5545 §3.6.1 (DTEND non-inclusive)](https://datatracker.ietf.org/doc/html/rfc5545)
- [PostgreSQL Range Types `[)` 標準形](https://www.postgresql.org/docs/current/rangetypes.html)
- [Google Calendar API Events (all-day end exclusive)](https://developers.google.com/calendar/api/v3/reference/events)
- [Bryntum Gantt — Finish date is exclusive](https://forum.bryntum.com/viewtopic.php?t=34642)
- [Java `LocalDate.datesUntil` (end exclusive)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/time/LocalDate.html)
- [Martin Fowler — Range pattern](https://martinfowler.com/eaaDev/Range.html)
- [Crunchy Data — Searching availability with daterange](https://www.crunchydata.com/blog/range-types-recursion-how-to-search-availability-with-postgresql)
- [ADR 0001 (型駆動 docs)](0001-typescript-types-as-api-spec.md)
- [ADR 0003 (Superseded)](0003-end-date-inclusive-storage.md)
- 関連 issue: [#45](https://github.com/tommykey-apps/resource-planner/issues/45)
