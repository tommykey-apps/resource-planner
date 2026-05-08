# 0005. Assignment のドラッグ / リサイズは `+server.ts` API + Optimistic UI + Last-write-wins

- **Status**: Accepted
- **Date**: 2026-05-08
- **Deciders**: @tommykey0925

## Context

UC-04 (アサインの期間を変更する) で、ResourceTimeline 上で帯をドラッグして移動 / リサイズしたら DB に永続化する必要がある。

選択肢:

| 案 | transport | UI | 楽観ロック |
|---|---|---|---|
| (A) **`+server.ts` API + optimistic + last-write-wins** | `PATCH /api/assignments/[id]` JSON | 即時反映、失敗で revert + toast | なし |
| (B) Form action + use:enhance | `?/updateAssignment` form data | enhance で似たことが書けるが冗長 | なし |
| (C) (A) + バージョン列で楽観ロック | API + JSON + `If-Match` header | 同時編集で 409 | あり |
| (D) WebSocket / Server-sent events | リアルタイム同期 | 別ユーザーの変更も即時反映 | あり (operational transform) |

ドメイン要件:
- 100 ユーザー以下の社内ツール、同時編集は稀
- ドラッグ操作は応答速度が UX に直結 (mouseup → 即時保存)
- 編集衝突が起きた場合の影響は軽微 (期間がちょっとずれるだけ、データ破損なし)

業界の Gantt / Calendar 慣例:
- Google Calendar: optimistic + last-write-wins (ドラッグ時の応答性優先)
- Smartsheet / Asana: 同様
- 大規模協調編集が必要な場合のみ (D) operational transform / CRDT を採用 (Figma など)

## Decision

**(A) を採用。**

### Transport: `+server.ts` の `PATCH /api/assignments/[id]`

- form action ではなく `+server.ts` を選ぶ理由:
  - drag/resize は **画面遷移を伴わない細粒度操作**
  - JSON body のほうが自然 (form data は string only、構造化データに不向き)
  - ResourceTimeline の `onMove` / `onResize` callback から直接 `fetch()` できる
- `GET` ではなく `PATCH`: 副作用 (= state 変更) を明示するため
- URL pattern: `/api/assignments/[id]` で id を path param、body は更新内容のみ

### Body schema

`assignmentApiUpdateSchema` (`web/src/lib/schemas/index.ts`):
```ts
{
  prevStartDate: DateString,    // SK 再計算用 (旧 SK Delete に必要)
  resourceId: string,
  projectId: string,
  startDate: DateString,        // inclusive
  endDateExclusive: DateString  // exclusive (post-transform 形、ADR 0004)
}
```

フォームの `assignmentCreateSchema` と違って `.transform()` は **持たない**。理由は ADR 0004 の「変換は **フォーム境界の 1 箇所だけ**」原則。API は app 内部 RPC (frontend → backend) なので、frontend 側で既に `endDateExclusive` を持っている (`fromTimelineAssignment` の戻り値)。再変換不要。

### UI: Optimistic + Revert

```ts
async function handleUpdate(updated: TimelineAssignment) {
  const prev = dbAssignments.find(a => a.id === updated.id);
  if (!prev) return;
  const next = fromTimelineAssignment(updated, prev);

  const snapshot = dbAssignments;        // 1. snapshot
  dbAssignments = ...;                   // 2. 即時反映

  try {
    const res = await fetch(`/api/assignments/${next.id}`, { method: 'PATCH', ... });
    if (!res.ok) throw new Error(...);
  } catch (e) {
    dbAssignments = snapshot;            // 3. revert
    toast.error('保存に失敗しました');     // 4. notify
  }
}
```

UI 通知は `svelte-sonner` の `toast.error()`。`<Toaster />` を `+layout.svelte` に 1 個配置。

### 楽観ロックは未実装 (last-write-wins)

- Assignment item に `version` 列を持たない
- `If-Match` header / ConditionExpression による衝突検知なし
- 100 ユーザー規模では同時編集衝突は実害低い → YAGNI
- 将来必要になったら別 ADR (例: 0007) で導入

## Consequences

### Positive

- **ドラッグの応答性が良い**: mouseup → 即時画面反映、API レイテンシは隠れる
- **失敗時の UX が透過的**: revert + toast で「保存できなかった、画面戻した」が伝わる
- **コード簡潔**: snapshot + try/catch + toast の 4 ステップで完結
- **Form action と分離**: form 系 (Create/Update from form) と RPC 系 (drag/resize) で関心ごとが分かれる

### Negative

- **同時編集衝突を検知できない**: A さんと B さんが同時に同じアサインをドラッグして両方保存できる (last-write-wins、後の人が勝ち)。社内 100 ユーザーで実害低いが、将来 SLA 要件が出たら 0007 で導入
- **`prevStartDate` を body に含めるダサさ**: SK が startDate を含む設計の副作用。GSI 化すれば不要になるが、現状の SK 設計のメリット (時系列順) を維持する判断
- **Toast 通知に依存**: `svelte-sonner` を導入。代替案 (アクセシブルな inline error 表示) は次フェーズで検討可能

### Neutral

- API endpoint は今のところ PATCH 1 つのみ。GET (個別取得) や DELETE は他 UC (PR-G) で別途追加予定。CRUD 全体を REST っぽく作るかは需要次第

## Alternatives considered

- **(B) Form action**: enhance で似たことは書けるが、`form data` の構造化が面倒、`<form>` タグを drag callback の中に作るのが不自然
- **(C) 楽観ロック**: 100 ユーザー規模では over-engineering。本番で衝突問題が出てから別 ADR で
- **(D) WebSocket / OT**: 大幅な実装コスト、複数人同期編集が要件になったら別 ADR で

## Implementation notes

実装 PR の主な変更:
- `web/src/routes/api/assignments/[id]/+server.ts` (新規): PATCH ハンドラ
- `web/src/lib/schemas/index.ts`: `assignmentApiUpdateSchema` 追加 (transform なし、API body 用)
- `web/src/routes/+page.svelte`: `handleUpdate` を async + optimistic + revert + toast に
- `web/src/routes/+layout.svelte`: `<Toaster />` 配置
- `docs/use-cases.md` UC-04 追加 (Mermaid sequence: 成功フロー / 失敗フロー)

## References

- [SvelteKit `+server.ts` docs](https://svelte.dev/docs/kit/routing#server)
- [Google Calendar drag UX (optimistic)](https://developers.google.com/calendar/api/guides)
- [svelte-sonner README](https://github.com/wobsoriano/svelte-sonner)
- [ADR 0004 (endDate exclusive)](0004-end-date-exclusive-with-form-transform.md)
- [ADR 0001 (TS types as API spec)](0001-typescript-types-as-api-spec.md)
- 関連 issue: #TBD (このコミット直後に作成)
