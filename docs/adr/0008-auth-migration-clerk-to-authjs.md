# 0008. 認証を Clerk → Auth.js + Email Magic Link に移行する

- **Status**: Accepted
- **Date**: 2026-05-09
- **Deciders**: tommykey0925

## Context

resource-planner は当初 Clerk dev instance + Microsoft Social Connection で認証を実装した。
Microsoft Social Connection を本番化するには Azure 管理画面で Custom OAuth App を登録する
必要があるが、社内ポリシーで Azure テナントへの管理アクセスが取れない状況が続いた。

このまま Clerk dev instance に依存し続けると以下が問題:
- 100 ユーザー上限 (社内利用としては問題ないが拡張しづらい)
- "Development banner" が画面上部に常時表示
- カスタムドメインが使えない (`*.accounts.dev` 経由)
- Microsoft Social は Clerk 管理 OAuth App を共有する形式 (本番認証用途には不適)

並行して以下の事象も観測:
- Clerk Org 未指定の 403 を URL 再叩きでバイパスできる挙動 (アプリ層の `requireOrg` を
  すり抜ける経路があった)

社内利用は本番投入前段階で、データ移行コストはゼロ。

## Decision

**Clerk を撤去し、Auth.js (`@auth/sveltekit`) + Email Magic Link (Nodemailer) に移行する**。

選定の根拠:
- **Email Magic Link は Azure アクセス不要** で「会社メールアドレス + ドメイン制限」のみで
  社内認証要件を満たす
- **Auth.js は provider 追加が config 1 行**: 将来 Azure アクセスが取れた時点で
  Microsoft Entra ID provider を **追加** するだけで SSO が並行稼働する (Issue #68 で
  runbook 化済)
- **DynamoDB adapter (`@auth/dynamodb-adapter`) が既存テーブルを利用可**: GSI1 を追加するだけ
  で User / Account / Session / VerificationToken を同テーブルに格納
- アプリ側ドメイン制限は `callbacks.signIn` で `email.endsWith('@' + ALLOWED_DOMAIN)` の
  単純な判定 (Clerk ベースより stable)

実装方針:
- email 送信は production (Lambda) では **AWS SES SDK (SESv2)** で `sendVerificationRequest`
  を override して実装。SMTP credentials の管理コストを避ける
- SES domain identity (`tommykeyapp.com`) を Terraform で管理、DKIM CNAME を Route53 に
- `AUTH_SECRET` は SSM SecureString (`/resource-planner/auth-secret`、`lifecycle.ignore_changes`)
  に手動投入、Lambda 起動時に top-level await で fetch
- 初回 sign-in 時に `team_default` への自動 join (`events.signIn` callback)

PR 構成 (Phase 3):
1. PR-A1 (#80): Auth.js 基盤 + `lib/auth.ts` 抽象 (構造のみ、Clerk 並行稼働)
2. PR-A2 (#82): Team モデル + GSI1 + ORG → TEAM rename + DDB adapter 配線
3. PR-A3 (#84): Magic Link provider + sign-in UI + ドメイン制限
4. PR-A4 (#86): SES infra + AUTH_SECRET SSM + Lambda IAM/env
5. PR-A5 (#87、本 ADR を含む): Clerk 完全撤去 + docs + ADR

## Consequences

### Positive

- **Azure テナントへの依存を断つ**: Microsoft Entra ID は将来オプション (#68 で runbook 化)
- **ベンダーロックイン軽減**: Clerk の独自 API / SDK / UI コンポーネント依存がゼロに
- **コスト**: Clerk 月額 → Auth.js (OSS) + AWS SES (1000 通/月 $0.10) で実質無償
- **Custom domain**: `planner.tommykeyapp.com` が認証ドメインも兼ねる
- **テスト容易性**: Auth.js の `signIn` callback / `events.signIn` は純粋関数として抽出可能、
  `aws-sdk-client-mock` で SES mock も書ける (将来 nodemailer-mock も導入予定)
- **Multi-team 対応の余地**: Clerk Organization 概念から離れ、自前 Team モデル (#81) で
  ロール / メンバー追加 / 切替の設計自由度が上がる

### Negative

- **Magic Link UX の遅延**: メール送信 → クリックの 2 ステップが必要 (Microsoft SSO 1 click より遅い)
- **SES Sandbox 制限**: 本番投入前に AWS Console で sandbox 解除申請が必要 (24-48 時間)
- **Auth.js `experimental` flag**: `@auth/sveltekit@1.11` は docs で experimental と表示。
  破壊的変更時に追従する必要あり (lock 版固定済、watch 必須)
- **DKIM 反映遅延**: Route53 CNAME 反映は数分〜15 分、 deploy 直後は send 失敗の可能性

### Neutral

- セッション cookie のサイズ: Clerk JWT (~3KB) → Auth.js DB session (cookie ~ 200B、
  state は DDB)。cookie 4KB 上限に余裕。
- ロール / 権限管理: 現状は単一 default team で全員 member、admin / member 区別は
  TeamMembership.role に予約済 (UI 実装は未着手)。

## Alternatives considered

- **Clerk のままで Microsoft Social を staging Clerk に切替**: Azure 管理アクセスが
  取れない以上、本番化できないため不採用
- **Auth0**: Auth.js と機能重複、セルフホストできない、本番化に同様の OAuth 設定が要る
- **Cognito**: AWS native だが、Magic Link は別実装が必要、UI が古く SvelteKit 統合も後付け
- **Microsoft Entra ID (社外テナント)**: 個人アカウントでは社内ポリシー違反、選択肢なし
- **Auth.js を NextAuth と並列に v5 (next-auth) で書く**: SvelteKit 統合は `@auth/sveltekit` が
  最新、NextAuth は Next.js 専用

## References

- Issue: [#65](https://github.com/tommykey-apps/resource-planner/issues/65) (auth migration epic)
- Issue: [#68](https://github.com/tommykey-apps/resource-planner/issues/68) (Microsoft Entra ID 後付け runbook)
- Issue: [#87](https://github.com/tommykey-apps/resource-planner/issues/87) (PR-A5)
- ADR: [0009](0009-org-to-team-redesign.md) (Team モデル再設計、本 ADR と同時 accept)
- ADR: [0007](0007-tdd-with-vitest-and-playwright.md) (TDD で移行を支える)
- [Auth.js SvelteKit docs](https://authjs.dev/getting-started/installation?framework=sveltekit)
- [Auth.js DynamoDB adapter](https://authjs.dev/getting-started/adapters/dynamodb)
