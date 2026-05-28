# 0013. Department を Team 内のグルーピング用ツリー (adjacency list) として追加する

- **Status**: Accepted
- **Date**: 2026-05-29
- **Deciders**: tommykey0925

## Context

Resource (人) を部署単位でまとめて見たい。部署は枝分かれする (本部 > 課 > ...) ため、
ツリー構造が要る。

前提・制約:
- テナント単位は **Team** ([ADR 0009](0009-org-to-team-redesign.md))。全アプリデータは
  `pk = TEAM#{teamId}` で隔離される。
- 今回の部署は **グルーピング用途** (表示・フィルタ・ナビ) であり、**隔離境界でも権限境界でもない**。
  ADR 0009 は将来拡張として「部署別に Team を分ける」案にも触れたが、本 ADR は別解
  ── **部署 = 1 Team 内の Department** ── を採る (用語は [CONTEXT.md](../../CONTEXT.md))。
- Resource / Project / Assignment は既に Team scope。Department を足しても**テナントモデルは不変**。
- 組織ツリーは小さい (実運用で数十ノード規模)。

## Decision

**Department を Team partition 内の entity とし、adjacency list (各ノードが親 ID を持つ) の
ツリーとして表現する。グルーピング専用で、隔離境界にはしない。**

- データ: `pk = TEAM#{teamId}`, `sk = DEPT#{departmentId}`, attrs `{ id, name, parentId }`。
- **`parentId` は nullable** = ルート。1 Team 内にルートは**複数可** (フォレスト)。
- **Resource は `departmentId` (nullable) を持つ**。所属はツリーの**任意ノード**でよく
  (葉に限らない)、**未所属 (null)** も有効。→ 既存 Resource は未所属扱いで**データ移行不要**。
- **削除 = 親へ繰り上げ (reparent/promote)**。削除ノードの子 Department と所属 Resource を
  親へ付け替える。ルート削除時は子 → 新ルート、Resource → 未所属。**Resource はカスケード削除
  しない** (下記 0006 との対比)。Assignment は department を参照しないので無関係。
- **付け替え (move)**: Department は `parentId` 更新、Resource は `departmentId` 更新。
  **循環はサーバ側で必ず拒否** (自分自身・自分の子孫・存在しない親を新親に指定不可)。
- **部署名は同じ親の下で一意** (兄弟間で重複禁止。Team 全体一意は厳しすぎ、無制約は紛らわしい)。
- **子孫集合の計算は in-memory** (`queryAllByTeam` が DEPT# も 1 query で返し、client/server が
  木を組む)。materialized path / GSI は**今は導入しない**。

## Consequences

### Positive

- **テナントモデル変更なし・データ移行ほぼゼロ** (既存 Resource = 未所属)。
- ツリー全体が `pk = TEAM#{teamId}` の **1 query** で取れる (Resource/Project/Assignment と同梱)。
- 削除で人・アサインが消えない (グルーピングノードの削除がデータを壊さない)。
- adjacency list は親ポインタ 1 個の更新で move でき、実装が軽い。

### Negative

- 子孫/サブツリー判定は **O(ツリーサイズ) の in-memory 計算**。組織規模なら無視できるが、
  巨大化 or 部署単位の DB subtree クエリが要るなら **materialized path を GSI に載せる**拡張が必要。
- **削除の繰り上げは「人が黙って上の部署へ移動」する**ため、UI で確認を出さないと驚く。
- adjacency list は木を都度 client/server で再構築する (フラットな item 群から組む)。

### Neutral

- **[ADR 0006](0006-cascade-delete-strategy.md) とは意図的に逆**: 0006 は Resource/Project 削除で
  関連 Assignment を**カスケード削除**する (Assignment は単独で無意味だから)。一方 Department は
  グルーピングにすぎず配下 Resource は独立実体なので**カスケードしない**。

## Alternatives considered

- **部署 = 別 Team (ADR 0009 のヒント案)**: 隔離・権限が過剰で、部署横断の集計/表示が難しく、
  「会社=テナント」の直感とズレる。グルーピング用途には不適。不採用。
- **Materialized path / closure table**: 任意サブツリーの DB クエリに強いが、組織規模では
  オーバーエンジニアリング。書き込み (path 再計算) も重い。成長したら再検討。不採用 (今は)。
- **非空なら削除禁止 (block)**: 安全だが「先に空にしろ」が煩雑。reparent の方が UX 良い。不採用。
- **Resource は葉部署のみに所属**: モデルは単純だが「本部直属の部長」を表現できず再編が窮屈。不採用。

## References

- [ADR 0009](0009-org-to-team-redesign.md) — Team をテナント単位に (Department はその内側)
- [ADR 0006](0006-cascade-delete-strategy.md) — cascade delete (本 ADR の削除方針はこれと対比)
- [CONTEXT.md](../../CONTEXT.md) — Team / Department / Resource / User の用語
- 実装 issue: tracer-bullet で分割 (本 ADR から起票)
