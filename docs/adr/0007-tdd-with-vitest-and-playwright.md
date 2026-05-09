# 0007. TDD で開発する: Vitest (unit / integration) + Playwright (E2E)

- **Status**: Accepted
- **Date**: 2026-05-09
- **Deciders**: tommykey0925

## Context

resource-planner はこれまで「動くコードを書いて手動で確認」 で進んできた。CI は型検査 (`pnpm check`)
と build のみで、テストは 0 件。これから着手する Auth.js 移行 (#65) と Team モデル再設計 (#25)
は触る面積が広く、「無自覚に何かを壊す」 リスクが高い。

合わせて、認証バグ (Org 未指定の 403 を URL 再叩きでバイパスできた現象) が手動 QA をすり抜けた
事実があり、回帰検知の自動化が必要。

## Decision

**TDD (赤テスト → 緑テスト → リファクタ)** を採用する。テストランナーは以下:

| レイヤ | ツール | 用途 |
|---|---|---|
| Unit / Integration | **Vitest** | 純粋関数 (date, schemas, timeline-adapter)、repository 層 (`aws-sdk-client-mock`)、DDB Local 統合 |
| Component | Vitest + `@testing-library/svelte` (将来) | Svelte 5 コンポーネント (必要になった PR で導入) |
| E2E | **Playwright** (基盤 PR-T5、実 spec は PR-A3 以降) | サインイン → CRUD のフルパス |

**設定方針**:
- `web/vitest.config.ts` は作らず、**`web/vite.config.ts` の `test` block** に併設 (設定一元化)
- 既定 `environment: 'node'` (純粋関数テストは jsdom 不要、起動が早い)
- コンポーネントテストはファイル先頭の `// @vitest-environment jsdom` directive で switch (PR-T2 以降)
- coverage provider は **`v8`** (Node ネイティブ、c8 不要)
- coverage threshold は **PR-T1 では設定しない** (0 件から始まるため)。PR-T2/T3 で実テスト追加とともに段階的に上げる (ratchet up)

**テスト命名規約**:
- `*.test.ts` — unit / integration (Vitest が拾う既定 glob)
- `*.svelte.test.ts` — Svelte コンポーネントテスト (jsdom directive で switch、PR-T2 以降)
- `*.integration.test.ts` — DDB Local 等の外部依存込み (PR-T3 で project 分離検討)
- `e2e/**/*.spec.ts` — Playwright (Vitest の glob からは除外)

**スクリプト**:
- `pnpm test` — `vitest run` (CI / 一回実行)
- `pnpm test:watch` — `vitest` (開発時の watch モード)
- `pnpm test:coverage` — `vitest run --coverage`
- `pnpm test:e2e` — `playwright test` (PR-T5 で導入、Phase 3 完了まで CI は disable)

**Playwright 設定**:
- `web/playwright.config.ts`: ローカル = Chromium / Firefox / WebKit、CI = Chromium のみ
- `webServer` で `pnpm preview` を auto-start、port 4173
- spec は `web/e2e/**/*.spec.ts`、結果は `test-results/` (.gitignore 済)
- 実 sign-in fixture が必要なため、本格的な spec は **PR-A3 (Magic Link 移行)** 以降に書く

**起票プロセスへの反映**:
- `.github/ISSUE_TEMPLATE/feature.yml` の AC に「unit test」「integration test (該当時)」「E2E
  test (該当時)」を追加。チェックを外して良いのは「該当しない」場合のみ (理由を PR 本文に記載)

## Consequences

### Positive

- **Auth.js 移行で何が壊れたかが分かる**: テストが先にあれば「壊れた箇所 = 赤いテスト」で特定できる
- **退行検知の自動化**: 手動 QA をすり抜けた認証バグ等を CI で catch
- **設計の前進**: 「テストしやすい構造」を意識することで、純粋関数 / I/O 分離が進む (repository
  層は既にそうなっている)
- **ドキュメントの代替**: テストは「実行可能な仕様書」として use-case の Mermaid を補完

### Negative

- **テスト基盤メンテのコスト**: deps (`vitest`, `@vitest/coverage-v8`, 後で
  `@testing-library/svelte`, `aws-sdk-client-mock`, `@playwright/test`) が増える
- **CI 時間が伸びる** (PR-T4 で `test-unit` + `test-integration` job 追加予定、~1〜2 分の追加見込み)
- **書き直し**: Auth.js 移行で repository 層の signature が変わる (`orgId` → `teamId`) ため、
  PR-T3 で書くテストの一部は PR-A2 で書き換え必要

### Neutral

- coverage threshold を後追いで上げる運用 (一気に 80% を要求しない)
- E2E は Phase 3 (Auth.js 移行) 後に書く (Clerk 撤去予定なので Clerk フローの E2E は無駄)

## Alternatives considered

- **Jest**: SvelteKit + Vite 環境では Vitest が de facto。ESM ネイティブ、Vite plugin 直結、Svelte 5
  対応も先行。不採用
- **node:test (Node 標準)**: assertion 力 / mock 力で Vitest に劣る。SvelteKit エコシステムも
  Vitest 前提。不採用
- **Cypress (E2E)**: Playwright が WebKit / Firefox を含むマルチブラウザを単一 API で扱える。
  Microsoft Entra ID 認証 (Phase 4) の OAuth コールバックも Playwright が安定。不採用
- **`vitest.config.ts` を別ファイル化**: 設定の重複が出るので vite.config.ts に併設 (Vitest 公式
  推奨パターン)
- **テスト駆動を見送り、移行後に書く**: 「移行で何が壊れたか分からない」 リスクを許容できないため
  不採用

## References

- Issue: [#65](https://github.com/tommykey-apps/resource-planner/issues/65) (auth migration epic)
- Issue: [#69](https://github.com/tommykey-apps/resource-planner/issues/69) (PR-T1)
- ADR 0001 (型駆動 docs 戦略): [0001-typescript-types-as-api-spec.md](0001-typescript-types-as-api-spec.md)
- [Vitest 公式](https://vitest.dev/) / [Playwright 公式](https://playwright.dev/)
