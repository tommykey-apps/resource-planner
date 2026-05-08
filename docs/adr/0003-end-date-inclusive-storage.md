# 0003. endDate は inclusive で保存し、ResourceTimeline 境界で adapter 変換する

- **Status**: Accepted
- **Date**: 2026-05-08
- **Deciders**: @tommykey0925

## Context

Assignment には `startDate` / `endDate` がある (例: 「5/1 から 5/31 まで」)。
ところが `@tommykey-apps/ui-components` の `ResourceTimeline` は **end-exclusive** を要求する (5/1〜5/31 表示なら `endDate = new Date(2026, 5, 1)` = 6/1)。

検討すべき選択肢:

- (A) DB / フォーム / docs を **inclusive 統一**、ResourceTimeline 境界で `±1 day` 変換する
- (B) DB / フォーム / docs を **exclusive 統一** (timeline と一致)
- (C) DB は duration (`startDate + days`) で持つ

人間の自然な「5/1 から 5/31」入力を内部で sentinel value (6/1) に変換するのは混乱の温床。一方、timeline ライブラリの規約は変えられない。

## Decision

**全層 inclusive 統一**。`endDate = "2026-05-31"` が「5/31 を含む最後の日」を意味する。

ResourceTimeline 境界 (`web/src/lib/timeline-adapter.ts`) で **2 箇所だけ** ±1 day 変換する:

- `toTimelineAssignment(dbAssignment, project)`: DB → timeline 形式 (`endDate += 1 day`)
- `fromTimelineAssignment(timelineAssignment, prev)`: timeline → DB 形式 (`endDate -= 1 day`)

DB 保存: `YYYY-MM-DD` string (Asia/Tokyo の暦日)。`Date.toISOString().slice(0, 10)` は UTC ベースで JST と日付がずれる可能性があるため、`web/src/lib/timeline-adapter.ts` の `formatLocalDate(d)` で自前 zero-pad 実装する。

## Consequences

### Positive

- フォーム / DB / docs / SK の `ASN#{startDate}#{id}` が **すべて同じ意味** で書ける (人間も SQL 風 query もそのまま読める)
- 変換ロジックは 1 ファイル 2 関数に閉じ込まる (`timeline-adapter.ts`)
- DB クエリ `BETWEEN "ASN#2026-05-01" AND "ASN#2026-05-31"` で「5 月開始の Assignment」が直感的に取れる

### Negative

- ResourceTimeline に渡すたび / 受け取るたびに変換が走る (CPU コストはほぼゼロだが認知コストはあり)
- 変換忘れ (生 DB Assignment を timeline に渡してしまう) でズレるバグが出やすい → TS 型を意図的に **DbAssignment vs TimelineAssignment** で別物にして、コンパイラに気づかせる
- adapter 関数が 2 個に増える → 将来 timeline ライブラリ仕様変更時の影響箇所だが、import path 1 つで済む

### Neutral

- 終了日 input フィールドの validation は inclusive 前提 (`startDate <= endDate`)。Zod schema の `refine` で表現

## Alternatives considered

- **(B) exclusive 統一**: DB に `2026-06-01` を保存して 5/31 終了を表現する。timeline 変換不要だが、フォームで `2026-06-01` を入れるか自動 +1 するか議論が起き、SK の `ASN#2026-06-01#...` も人間が読み解きにくい
- **(C) duration 化**: `startDate + days` で持つ。range filter (`startDate BETWEEN ... AND ...`) は普通にできるが、`endDate` 主体の query (例: 「5 月末までに終わるもの」) は GSI かアプリ層で計算が必要。要件に対して overengineering

## References

- [ResourceTimeline API (調査結果、Plan ファイル参照)](#)
- [ADR 0001](0001-typescript-types-as-api-spec.md)
- 関連 issue: [#35](https://github.com/tommykey-apps/resource-planner/issues/35)
