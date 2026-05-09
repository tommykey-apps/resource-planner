# 0009. マルチテナント単位を Clerk Org → 自前 Team モデルに再設計する

- **Status**: Accepted
- **Date**: 2026-05-09
- **Deciders**: tommykey0925

## Context

ADR 0008 で認証を Clerk → Auth.js + Magic Link に移行することを決めた。
これに伴い「アプリデータの所有単位」 (DDB pk のテナント分割キー) も Clerk Org ID から
自前のテナント概念に切り替える必要がある。

設計時の前提:
- 社内利用は **未開始**: ORG# 配下の本番データは存在しない、移行不要
- 当面は **1 チーム運用** で十分 (社内全員が同じデータを見る)
- 将来の拡張可能性は残したい:
  - 複数の組織で使う (子会社、部署別、PJ チームごと)
  - 1 user が複数 team に所属する
  - admin / member 等のロール
- Auth.js DynamoDB adapter は GSI1 (`GSI1PK` / `GSI1SK`) を要求 (User by email、User by account)
- 同じ GSI1 を「user の所属 team 一覧」 逆引きにも兼用したい

## Decision

**Clerk Organization 概念を捨て、自前の `Team` / `TeamMembership` モデルに再設計する**。

データモデル (DynamoDB Single Table):

```
=== App entities (Team scope) ===
pk = TEAM#{teamId}  sk = META                    (Team metadata)
pk = TEAM#{teamId}  sk = MEMBER#{userId}         (Team-centric membership)
pk = TEAM#{teamId}  sk = RES#{resourceId}        (既存 Resource、pk のみ rename)
pk = TEAM#{teamId}  sk = PRJ#{projectId}         (既存 Project、pk のみ rename)
pk = TEAM#{teamId}  sk = ASN#{startDate}#{id}    (既存 Assignment、pk のみ rename)

=== Auth.js entities (DDB adapter 管理) ===
pk = USER#{userId}        sk = META                          (User base)
pk = USER#{userId}        sk = ACCOUNT#{provider}#{accountId}
pk = SESSION#{token}      sk = META
pk = VERIFICATION#{token} sk = META  (TTL = expires)

=== GSI1 (3 用途を兼用) ===
GSI1PK = USER#email#{email}    GSI1SK = USER#email#{email}     (Auth.js: User by email)
GSI1PK = ACCOUNT#{provider}    GSI1SK = ACCOUNT#{providerAccountId} (Auth.js: User by account)
GSI1PK = USER#{userId}         GSI1SK = TEAM#{teamId}          (App: user → team 一覧)
```

実装方針:
- 初期は **`team_default` の単一 team** で運用 (`getOrCreateDefaultTeam` を `events.signIn`
  で idempotent 実行、初回 sign-in 時に自動 join)
- `lib/auth.ts` の `requireSession()` が返す `AppSession.teamId` は当面 hardcode (`'team_default'`)
- 将来の multi-team 対応で必要となる primitive はすべて実装済:
  - `addMembership(teamId, userId, role)` — 1 PutItem で team-centric + GSI1 user-centric を同時設定
  - `getUserTeamIds(userId)` — GSI1 経由
  - `getTeamMembers(teamId)` — team-centric
  - `getOrCreateDefaultTeam()` — idempotent

PR 構成:
- PR-A2 (#82): スキーマ実装 (GSI1 / TTL / Team 関連 helper / repository)
- PR-A5 (#87、本 ADR を含む): 完成形を ADR として記録、docs 反映

## Consequences

### Positive

- **Clerk からデータモデルを完全独立**: Clerk Org ID ハードコードがゼロ、別 IdP に乗り換えても
  データ構造は不変
- **multi-team 拡張の primitive が揃う**: `getUserTeamIds` + GSI1 で「user が所属する team 一覧」
  逆引きが Query 1 本で済む
- **GSI1 の ROI が高い**: Auth.js の必須 index と App の逆引きを 1 つの GSI で兼用、
  GSI 追加コスト最小
- **ロール導入の余地**: `TeamMembership.role` を `'admin' | 'member'` で予約済、UI 追加だけで有効化

### Negative

- **`teamId` が当面 hardcode**: multi-team UI を作るまで `'team_default'` 固定。session に
  載せる `currentTeamId` の concept だけ用意して使っていない (YAGNI 寄りだが consequence)
- **Team 削除の cascade 未実装**: 現状 `deleteTeam` 無し。default team しか存在しないので
  着手していないが、multi-team 化で必要 (ADR 0006 cascade pattern を流用予定)
- **既存 Resource / Project / Assignment の pk が `ORG#` → `TEAM#` に変わる**: ローカル DDB は
  `make clean && make db` で再作成必要 (本番未稼働なので影響なし)

### Neutral

- 同じ user が複数 team で同じ email を持つケース: Auth.js の `User#email` は global unique
  なので問題なし (1 email = 1 user)
- GSI1 の hot partition: 100 ユーザー規模なら問題なし、エンタープライズ規模なら GSI shard 検討

## Alternatives considered

- **Clerk Org ID のまま、prefix だけ `TEAM#` に変える**: 結果的に Clerk から離れていないため不採用
- **Org / Team / Workspace を別 entity にする (3 階層)**: 現状の社内 1 組織想定では over-engineering
- **Session に teamId を持たせず、URL ベース (`/t/{teamId}/...`) で切替**: SvelteKit Layout 階層が
  深くなる、初期 1 team 想定では複雑度に見合わない、将来 PR で別途検討
- **PostgreSQL 移行 + 関係テーブル**: DDB 単一テーブル前提を変える大改修、コストに見合わない

## References

- Issue: [#65](https://github.com/tommykey-apps/resource-planner/issues/65) (auth migration epic)
- Issue: [#81](https://github.com/tommykey-apps/resource-planner/issues/81) (PR-A2 で実装)
- Issue: [#87](https://github.com/tommykey-apps/resource-planner/issues/87) (PR-A5 で完成形)
- ADR: [0008](0008-auth-migration-clerk-to-authjs.md) (本 ADR と同時 accept、認証側の判断)
- ADR: [0006](0006-cascade-delete-strategy.md) (将来の Team cascade で流用予定)
- [Auth.js DynamoDB adapter (schema)](https://authjs.dev/getting-started/adapters/dynamodb#schema)
