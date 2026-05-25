# 0011. Better Auth への移行は当面据え置く (DynamoDB primary 不適合)

- **Status**: Accepted
- **Date**: 2026-05-26
- **Deciders**: tommykey0925

## Context

ADR [0008](0008-auth-migration-clerk-to-authjs.md) で採用した Auth.js (`@auth/sveltekit` + `@auth/dynamodb-adapter`) 周辺で、 2025-09-22 に **「Auth.js project is now part of Better Auth」** という公式統合アナウンスが出た (authjs.dev 上部 banner、 `Auth.js © Better Auth Inc.`)。 Auth.js README にも:

> Auth.js is now part of Better Auth. We recommend new projects to start with Better Auth unless there are some very specific feature gaps (most notably stateless session management without a database).

と明記された。 これを受けて Issue [#207](https://github.com/tommykey-apps/resource-planner/issues/207) で Better Auth への移行検討 epic を起こし、 妥当性調査を行った。

### 調査の前提

- 現状 (ADR 0008 / 0009 で確定): Auth.js v5 (`@auth/sveltekit ^1.11.2`) + `@auth/dynamodb-adapter ^2.11.2` + Single Table Design (user / account / session / verificationToken を app entity と同じ DDB テーブルに同居)
- 検討対象: Better Auth (https://better-auth.com、 v1.6.11 / 2026-05-12 時点)
- 期間: 2026-05-26 にまとめて調査

### 調査結果

**1) Better Auth の production 適格性は高い**

| 指標 | 値 |
|---|---|
| Stars / Contributors | 28.4k / 849+ |
| Funding | $5M Seed (2025-06、 Peak XV Partners) — corporate-backed |
| Production adopters | OpenAI / Databricks / Strapi (公式 Trusted by) |
| Release cadence | v1.6.11 (2026-05-12)、 925+ releases (週次以上) |
| Auth.js handover | 2025-09-22 公式 |
| License | MIT |

**2) ⚠️ Better Auth + DynamoDB は公式に「primary storage として非推奨」**

Issue [better-auth/better-auth#113](https://github.com/better-auth/better-auth/issues/113)「Add DynamoDB adapter support」 を精査:

- メンテナ Bekacru の回答: **"no plans currently"** (公式 DynamoDB adapter を出す予定なし)
- AWS 専門家 (`bestickley`) のコメント:
  > "DynamoDB will not be able to support list APIs in a scalable way (i.e. ListUsers, ListOrganizations, etc.). DynamoDB is a key-value store. **It will work great for secondary storage, but not primary**."
- 試行者 (`dvalbuena1`): Better Auth adapter API は **SQL WHERE clause を前提とした抽象**で、 DynamoDB の access pattern (PK/SK + GSI) と思想が異なる。 PartiQL / Scan に倒すと cost / perf が悪化する
- コミュニティ PoC [renanwilliam/better-auth-dynamodb](https://github.com/renanwilliam/better-auth-dynamodb): ⭐15、 license 未定義、 release 0、 「Scan を使った PoC」 と作者自身が明記 → **production 不可**
- Better Auth 公式の代替推奨パス:
  - **primary**: Aurora Serverless v2 (auto-pause で scale-to-0)、 もしくは Aurora DSQL
  - **secondary (session / rate-limiter)**: DynamoDB を `SecondaryStorage` (key-value 抽象) として使う公式 API あり

**3) 真の選択肢 (本プロジェクト固有)**

| 案 | 概要 | コスト | リスク | 評価 |
|---|---|---|---|---|
| **A. Auth.js 据え置き** | 何もしない、 EOL or 致命的機能不足が見えるまで待つ | 0 | 低 (作業しない)、 中 (将来 migration cost が膨らむ可能性) | ★★★ 現実解 |
| B. Better Auth + Aurora Serverless v2 | ADR 0009 (Single Table) を一部破棄、 auth テーブルを RDS に移管 | 大 (infra + migration script + 月額 $) | 中 (アーキ大変更) | ★★ 長期正解だが今やる動機は弱い |
| C. Better Auth + 自作 DynamoDB adapter | 既存 DDB を保持、 SQL 抽象と DDB を強引に接続 | 中-大 (Better Auth と思想が違う adapter を自作 + 維持) | 高 (フレームワーク非推奨、 list API 遅、 メンテ負荷) | ✗ 公式コミュニティが警告 |
| D. Better Auth + DDB SecondaryStorage + 別 primary DB | session のみ DDB、 user/account は RDS | 大 (二重 DB)、 複雑性増 | 中 | ✗ 単一性損失 |

**4) Auth.js の延命寿命**

- 明示的な deprecation date は authjs.dev / GitHub README で公開されていない (「now part of Better Auth」 とだけ)
- 最後の `next-auth` リリースは `4.24.14` (2026-04-14) — 5 月時点で 1.5 ヶ月リリースなし
- Open issue 388 / open PR 198 で消化スピードは低下傾向だが完全停止ではない
- 当面は動く、 ただし新機能 (passkey 等) は来ない見込み

## Decision

**Better Auth への移行は当面据え置く (短期: ~6 ヶ月)**。

理由を 1 行で:

> Better Auth は production-ready でトレンドも正しいが、 **本プロジェクトの DynamoDB primary storage と公式に相性が悪い**ため、 真の migration コストは「Auth.js → Better Auth」 ではなく「**DynamoDB → Aurora**」 になる。 そこまでの投資を正当化する具体的な driver が現時点で存在しない。

合わせて以下を実施する:

- Issue #207 を「Decision: defer」 で更新 (close せず、 再評価 trigger を本文に明記)
- 本 ADR を「Accepted」 として残す (将来同じ調査を繰り返さないため)

## Consequences

### Positive

- **作業コスト 0 で済む**: 現状の Auth.js + DDB Single Table (ADR 0008 / 0009) を維持
- **architectural decision 一貫性**: ADR 0009 の Single Table Design を破壊せず、 app entity と auth entity の同居が継続
- **将来の選択肢が温存される**: trigger 条件 (下記) のいずれかが顕在化したら再評価可能。 ADR 0011 が「過去に検討した結果」 として参照できる
- **コミュニティ動向の watch コストのみ**: 月数十分の monitoring で済む

### Negative

- **Better Auth の機能進化に乗れない**: passkey / 2FA / multi-tenant / OIDC SSO 強化など Better Auth 側で先行する機能は当面採用できない
- **Auth.js の bus factor リスク**: 「maintenance phase」 表明で security fix 以外の更新ペースが落ちる可能性、 致命的脆弱性発見時の patch 提供スピードが遅れる risk
- **migration cost を将来に preload**: 6-12 ヶ月後に再評価して migration 必要となった場合、 当該時点の Auth.js / Better Auth / 移行 tooling の状況次第でコストが増える可能性
- **新規メンバーへの説明コスト**: 「なぜ公式が Better Auth 推奨なのに使わないのか」 を ADR 0011 で説明する必要がある (= 本 ADR の存在価値)

### Neutral

- 影響範囲は auth domain のみ、 他の ADR / 設計判断には影響しない

## Alternatives considered

- **案 B (Better Auth + Aurora Serverless v2 移行)**: 長期的には最も整合的だが、 ADR 0009 の Single Table Design を部分的に破棄する大改修。 Aurora の月額コスト ($)、 migration script の作成・検証、 二重 DB 運用などのコストを正当化する driver が現時点で存在しない (= 機能不足や信頼性問題が顕在化していない)
- **案 C (Better Auth + 自作 DynamoDB adapter)**: better-auth#113 で公式・コミュニティが揃って「primary storage として不適合」 と結論、 PoC も production 不可。 自作してフレームワークと敵対するメンテ負荷を抱える価値は無い
- **案 D (二重 DB)**: 単一性が失われ、 ADR 0009 の利点を打ち消す
- **案 「Better Auth 提供前提で DDB single-table 自体を見直す」**: 大きな決定なので別 ADR で扱うべき。 本 ADR の scope を超える
- **case「Auth.js を v5 stable まで使い倒す」**: Auth.js v5 系自体はまだ動作するが、 「stable」 という単一 milestone 待ちは defer の理由として弱い。 trigger 化した方が運用しやすい

## 再評価 Trigger (いずれかが顕在化したら本 ADR を superseded で更新)

1. **Auth.js 公式が明示的に EOL アナウンス** (security fix も止まる日付が決まる)
2. **Better Auth 限定の機能が必須化**: passkey / 2FA / OIDC enterprise SSO / multi-tenant ロール管理 など、 本プロジェクトで unavoidable な要件が立つ
3. **DDB Single Table 自体を別理由で再設計する decision** が起きる (= 同時に Better Auth 化を載せる経済性が出る)
4. **Aurora Serverless v2 / DSQL を別 service で採用済**、 コスト・運用感が許容できることが社内で確認できた
5. **コミュニティで Better Auth 公式 DynamoDB adapter or production-ready third-party adapter が出る** (better-auth#113 の状況変化)
6. **再評価 deadline**: **2026-11-26** (本 ADR から 6 ヶ月後) — 上記 trigger が無くても定期 review

## References

- Issue: [#207](https://github.com/tommykey-apps/resource-planner/issues/207) (Better Auth migration epic — 本 ADR で defer 決定)
- ADR: [0008](0008-auth-migration-clerk-to-authjs.md) (現行 Auth.js 採用)
- ADR: [0009](0009-org-to-team-redesign.md) (Single Table Design + Team モデル)
- Auth.js 公式: <https://authjs.dev> (top banner「now part of Better Auth」)
- Better Auth 公式: <https://www.better-auth.com>
- Better Auth issue: [better-auth/better-auth#113](https://github.com/better-auth/better-auth/issues/113) (DynamoDB adapter 要望、 「no plans currently」 with 詳細議論)
- コミュニティ PoC: <https://github.com/renanwilliam/better-auth-dynamodb> (Scan-based、 production 不可)
- Better Auth 公式 blog: <https://www.better-auth.com/blog> (「Auth.js is now part of Better Auth」 2025-09-22、 「$5M Seed」 2025-06-24)
