# 0010. Project に詳細情報 (description / tags / links) を **同 item の attribute** として追加する

- **Status**: Accepted
- **Date**: 2026-05-13
- **Deciders**: @tommykey0925

## Context

`Project` は現状 `{ id, name, color }` の 3 項目のみで、 「使用技術 / 案件説明 / 関連リンク」 を
アプリ内で記入・参照できない (issue #187)。 要員計画の現場で都度別資料を開く負担がある。

データモデルの選択肢:

| 案 | 説明 | Read | Write | 1 item size |
|---|---|---|---|---|
| (A) Project entity に attribute 追加 | `PRJ#{id}` に description / tags / links を直接追加 | 既存 query で完結 | 既存 PutItem / UpdateItem で完結 | ~37KB / 400KB |
| (B) 別 entity (`PRJDETAIL#{id}`) | 一覧表示と切り分けて読む | BatchGetItem / 別 GSI 必要 | 別途 PutItem | 分離 |

`+layout.server.ts` の load は既に `pk = TEAM#X` で全件 Query しているため、 案 A の overhead は
`marshall` で attribute が増えるだけ。 案 B は read が 2 段 (`listProjects` → 詳細 BatchGet) になり、
SSR で markdown render する設計 (本 ADR の Decision、 後述) と合わない。

実装上の制約 (調査で確認):

- DynamoDB UpdateExpression は SET と REMOVE を同一 expression 内で **異なる attribute** に並べる
  場合のみ並走可能。 同名 attribute path が SET/REMOVE で重複すると `ValidationException` で reject される
  ([AWS docs](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.UpdateExpressions.html))
- `removeUndefinedValues: true` (`web/src/lib/db/client.ts`) は marshall で `undefined` 属性を消すが、
  **空配列 `[]` は `L: []` で保存される**ため、 「未設定 = 削除」 を担保するには空判定で REMOVE を出す必要がある
- `marked` v18 sync API + `isomorphic-dompurify` (内部 `dompurify@^3.4.2` / CVE-2024-45801 / -47875 /
  CVE-2025-26791 修正済) は SSR / CSR / vitest jsdom 全環境で動作
- DOMPurify default 設定では `<img>` / `<style>` が許可されている → 明示的に `FORBID_TAGS` で除外しないと
  description で `<img onerror>` 等の XSS attack vector を残してしまう

## Decision

**(A) Project entity の attribute 拡張を採用する。**

```
PRJ#{id}
  id: string
  name: string
  color: string         // #RRGGBB
  description?: string  // markdown raw、 max 10,000 chars
  tags?: string[]       // List, max 20 件 / 各 30 chars
  links?: ProjectLink[] // List of Map, max 10 件
```

`ProjectLink = { label?: string; url: string }`。 url は `http(s)` のみ許可。

### 「未設定 = REMOVE で attribute 削除」 semantics

`updateProject` は attribute 単位で SET と REMOVE を mutual exclusion で出し分ける。
description 空文字 / tags 空配列 / links 空配列 はいずれも REMOVE 側に回す:

```
SET #name = :name, color = :color, description = :description REMOVE tags, links
```

DynamoDB の REMOVE は **存在しない attribute に対しては no-op** ([AWS docs 引用](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.UpdateExpressions.html#Expressions.UpdateExpressions.REMOVE) "If the attributes don't exist, nothing happens") なので、 旧 item にも安全。
`createProject` は spread 短絡で 「非空のみ Item に入れる」 ことで、 後段 query 期待値 (`attribute_exists(description)` 等) を REMOVE 動作と整合させる。

### description は SSR で markdown render

`+layout.server.ts` の load 内で `renderMarkdown(p.description)` を呼び、 `descriptionHtml` を
client に渡す (PR-N4 で実装)。 client 側は `{@html descriptionHtml}` を表示するだけ。 理由:

- `$effect` 内 `await import('marked')` は SSR で実行されないため初回描画で description が空になる
- `isomorphic-dompurify` で server 側でも sanitize できる、 Lambda warm state での render は 1ms 未満
- 初回 modal open で markdown が即見える (lazy await なし)

### XSS 対策 (二段防御)

1. **markdown render 層** (PR-N2): `marked` v18 sync + `isomorphic-dompurify`。
   - `FORBID_TAGS`: `img`, `style`, `iframe`, `object`, `embed`, `form`, `input`, `button`, `script`, `svg`
   - `FORBID_ATTR`: `style`, `onerror`, `onload`, `onclick`
   - `ALLOWED_URI_REGEXP`: `^(?:https?|mailto):/i`
   - `SAFE_FOR_TEMPLATES` を **使わない** (CVE-2025-26791 発火条件)
2. **CSP 層** (PR-N0 で実装済): `script-src 'self' 'nonce-...'` で inline script 流入を block。

`<a>` の `target` 属性は DOMPurify default で strip される (tabnabbing 対策) ため、 markdown 内
リンクは同タブ遷移になる。 `ProjectDetailView` (PR-N4) の links 一覧は別途 `<a target="_blank"
rel="noopener noreferrer">` で開く。

### tags は **List of String** で保存する (Set ではない)

`List<String>` (DDB `L`) を採用、 `String Set` (DDB `SS`) ではない。 理由:

- DDB String Set は **空 Set 不可** で、 「ゼロ件のとき item 全体を削除しないと表現できない」 制約がある
- List なら順序保持、 入力順 (`'TypeScript, AWS' → ['TypeScript', 'AWS']`) が UI 表示と一致
- TS の `string[]` に素直に対応、 marshall/unmarshall に型注釈不要
- dedup / NFC normalize は schema 層で実施するため Set のユニーク保証は不要

### 「同 item 採用の境界」 (将来 split が必要になる条件)

現サイズ ~37KB / DDB 1 item 上限 400KB の **10%**。 以下に該当したら別 entity 化を別 ADR で再検討:

- description 10,000 chars × UTF-8 / 案件 × 全 attribute 平均で 1 item 80KB を超える
- assignments 一覧 SSR で project 詳細を render する都合、 一覧 read overhead が体感悪化する
  (現状 Project は teamId 内全件 Query で 1 request、 size 増は read latency に直結)

## Consequences

### Positive

- **read 1 request で完結**: `+layout.server.ts` の既存 Query (`pk = TEAM#X`) で詳細も載る、
  別 GSI / BatchGet 不要
- **write 1 request で完結**: PutItem / UpdateItem 1 回で project + 詳細を atomic に書ける
- **後方互換**: 既存 item は description / tags / links 属性なし、 TS optional + `?? []` で読める。 マイグレーション不要
- **REMOVE semantics 一貫**: 空文字 / 空配列 / undefined は全て attribute 削除に正規化、
  「保存されているけど空」 状態が存在しない
- **二段防御**: markdown render の sanitize と PR-N0 で投入した CSP nonce で、 XSS attack chain を 2 層で遮断

### Negative

- **item size 増**: description 10KB × 案件数 で 1 item が膨らむ。 80KB 想定 (現サイズの ~2x) を
  超えたら別 entity 分離を検討
- **schema migration を諦める**: optional attribute なので Java/PG 流の migration はせず、
  unmarshall 側で `?? []` で吸収。 「全 item に description がある」 と仮定するコードを書くと壊れる
- **SSR render コスト**: Lambda cold start で `marked + isomorphic-dompurify` 初回 import に
  +100-300ms。 warm state なら 1ms 未満で許容範囲
- **DynamoDB Stream を将来使うと payload が膨らむ**: 現状 Stream 未使用、 将来オフロード処理 (検索 index 等)
  を組むときに 1 record サイズが増える点に注意

### Neutral

- **DDB List/Map の partial update を行わない**: tags / links は全置換のみ (1 件追加でも List 全体を書き換える)。
  現運用では編集モーダルで毎回 form 全体を送るため partial update 要件なし

## Alternatives considered

- **(B) 別 entity (`PRJDETAIL#{id}`)**: read が 2 段になり SSR markdown render 設計と合わない。
  size 80KB を超えた将来時点で再検討
- **(C) tags を `String Set` (`SS`) で保存**: 空 Set 不可で「ゼロ件 = item 削除」 表現になり、
  REMOVE semantics が壊れる
- **(D) description を MDX / 独自記法**: 業界標準の markdown から外れる学習コスト > 機能差分の価値
- **(E) `dompurify` を直接 import**: SSR で `globalThis.window` が無く動かない。 vitest 4 + jsdom v29
  でも `globalThis.window !== self` 既知問題あり ([vitest #9279](https://github.com/vitest-dev/vitest/issues/9279))。
  `isomorphic-dompurify` を採用

## Out of scope

以下は本 ADR と PR スコープ外。 必要になった時点で別 ADR / issue で扱う:

- markdown **table** / **image** / **input** (`<img>` `<input>` `<table>` のうち table のみ ALLOWED に追加検討余地、 現状 `<table>` ALLOWED, `<img>`/`<input>` FORBID)
- tags / links の chip preview / drag reorder / `<datalist>` autocomplete
- timeline tooltip に description を出す
- status / 顧客 / PM 名 等の構造化フィールド (本 ADR の 「list of attribute」 拡張で吸収可能、 PR 1 つで足せる)
- CSP `style-src` の nonce 化 (現状 `'unsafe-inline'`)
- Edit / Preview tab (Linear / Jira 風 split editor)
- markdown editor toolbar (GitHub 風 bold / italic ボタン)
- superforms 導入 (本 plan では SvelteKit 標準 enhance + hidden input JSON で nested 表現)

## Implementation notes

- `web/src/lib/types.ts`: `Project` に description / tags / links を optional 追加、 `ProjectLink` 型を新規 export
- `web/src/lib/schemas/index.ts`: `descriptionSchema` / `tagsCsvSchema` / `linkObjectSchema` /
  `linksJsonSchema` を追加、 `projectCreateSchema` / `projectUpdateSchema` を transform pipeline で再構築
- `web/src/lib/repository/project.ts`: `createProject` は optional spread、
  `updateProject` は SET / REMOVE を attribute 単位で mutual exclusion
- `docs/db/entities.md`: Project section に新フィールド行を追加
- 既存 `web/src/routes/+page.server.ts` の `createProject` / `updateProject` action は本 PR では
  **触らない** (form 拡張は PR-N3 で実装)。 既存 form 経由で送られた missing field は schema 内で
  undefined / [] に正規化され、 repository が REMOVE を発行するが、 旧 item に該当 attribute が
  存在しないため no-op で済む (DDB REMOVE idempotent on non-existing)

### DDB read path 規約: `as <Entity>` 全体キャスト禁止 (#196 で確定)

`queryAllByTeam` 等の read path で DDB Item から domain object を組み立てるとき、 **`as <Entity>` の
全体キャストは禁止**。 個別 field の `as string` / `as string[]` 等に **localize** すること。

```ts
// ❌ 駄目: optional フィールド追加時に型 error で気づけない (#194 で発生)
data.projects.push({ id: item.id, name: item.name, color: item.color } as Project);

// ✅ 良い: 個別 cast + optional は spread + 条件分岐
const project: Project = {
  id: item.id as string,
  name: item.name as string,
  color: item.color as string,
  ...(typeof item.description === 'string' && item.description.length > 0
    ? { description: item.description }
    : {}),
  ...(Array.isArray(item.tags) && item.tags.length > 0 ? { tags: item.tags as string[] } : {}),
  ...(Array.isArray(item.links) && item.links.length > 0
    ? { links: item.links as ProjectLink[] }
    : {})
};
```

理由:

- 全体キャストは TypeScript の missing-property 検出を握り潰す。 PR-N1 (#194) で `Project` に
  optional 追加した際、 read path の `as Project` cast が「description / tags / links 読み忘れ」 を
  hide してしまい、 「保存されるが load 時に常に undefined」 という Critical bug を生んだ (#196)
- 個別 cast + spread に localize すれば、 将来 optional 追加時に **TS error で即座に気づける** ように
  なる (個別 field を増やし忘れたら型 が `Project` に narrow できない)
- spread 条件分岐は write 側の REMOVE semantics と整合: write で REMOVE → DDB に attribute key なし
  → read で spread が key 自体を出さない (round-trip 一貫)

この規約は Resource / Assignment の将来 optional 追加にも適用する。 また同 PR (#196 fix) で
`web/src/lib/repository/index.test.ts` に「optional あり / 全 absent / empty list / partial」 の
4 ケースを追加し、 `integration.test.ts` で DDB Local round-trip も検証。 同 pattern を新 entity 追加時にも踏むこと。

注: write 側 (`createProject` の `input.description ? ... : ...`) は schema 層で空文字を `undefined`
に正規化するため truthy チェック 1 つで十分。 read 側で `typeof === 'string' && length > 0` の
二重 guard を入れているのは、 migration ツールや管理コンソールで DDB に直接空文字が書き込まれた
場合の defense in depth であり、 通常 flow では `length > 0` 部分は到達しない (write/read で
条件が非対称に見えるのはこの理由)。

## References

- [DynamoDB Update Expressions (SET / REMOVE)](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.UpdateExpressions.html)
- [DynamoDB item size limits](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html)
- [marked using_advanced](https://marked.js.org/using_advanced)
- [cure53 DOMPurify](https://github.com/cure53/DOMPurify), [Default TAGs allow-list](https://github.com/cure53/DOMPurify/wiki/Default-TAGs-ATTRIBUTEs-allow-list-&-blocklist)
- [Zod v4 API](https://zod.dev/api), [Zod v4 error customization](https://zod.dev/error-customization)
- [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [Alex DeBrie — DynamoDB limits and item size](https://www.alexdebrie.com/posts/dynamodb-limits/)
- 関連 issue: [#187](https://github.com/tommykey-apps/resource-planner/issues/187)
- 関連 PR: PR-N0 (#193, CSP 一段目)、 PR-N2 以降 (markdown render / form / SSR)
- 関連 ADR: [ADR 0001 (型駆動)](0001-typescript-types-as-api-spec.md)、 [ADR 0004 (schema 1 箇所変換)](0004-end-date-exclusive-with-form-transform.md)、 [ADR 0006 (cascade)](0006-cascade-delete-strategy.md)、 [ADR 0007 (TDD)](0007-tdd-with-vitest-and-playwright.md)
