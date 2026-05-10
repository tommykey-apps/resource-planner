---
name: tdd
description: ADR 0007 に沿って TDD で進めるための workflow guide。`/tdd <task の説明>` で起動。
disable-model-invocation: true
allowed-tools: Bash(pnpm *) Bash(git *) Read Edit Write Grep Glob
---

# TDD workflow (resource-planner、ADR 0007)

## Current test status

```
!`cd web && pnpm test 2>&1 | tail -30`
```

## Currently staged files

```
!`git diff --cached --name-only`
```

## このセッションで既に変更したファイル (uncommitted)

```
!`git diff --name-only`
```

---

## 進め方 (ユーザーから依頼された task: `$ARGUMENTS`)

1. **失敗するテストを先に書く** (RED)
   - 該当する `*.test.ts` を新規作成 / 既存に追加。`web/src/lib/**/*.test.ts` は unit、`web/src/lib/repository/integration.test.ts` は DDB Local。
   - `pnpm test` を実行して **新しいテストが fail することを確認**。fail メッセージが期待した assertion に一致しているか確認。
   - 「テストが書けない」「テストが pass してしまう」 場合は、依頼内容が曖昧 / 既存挙動と一致 を疑い、ユーザーに確認。

2. **最小限の実装で pass させる** (GREEN)
   - テストを通す **最小コード**だけ書く。speculative な機能 / 未使用の引数 / 抽象化は禁止 (ADR 0007 / CLAUDE.md "Simplicity First")。
   - `pnpm test` で全 test 緑を確認。

3. **必要なら refactor** (REFACTOR)
   - テストが緑のまま実装を整える。リファクタの内容は別 commit に分けるとレビューしやすい。

4. **commit / PR**
   - test ファイルと実装ファイルは **同じ commit** に入れる (TDD discipline の証跡)。
   - hook (`.claude/hooks/warn-untested.sh`) が「対応する `*.test.ts` が staged されていない」 と警告したら、test を先に `git add` して staged してから Edit。

## 注意点

- **境界 / 例外 / null / 0 件 / 100 件超** を最低限カバー (ADR 0007 命名規約)
- repository 層は `aws-sdk-client-mock` で unit test、DDB Local 統合は `*.integration.test.ts` で `describe.runIf(process.env.AWS_ENDPOINT_URL)` gate
- Svelte コンポーネントテストはまだ jsdom + `@testing-library/svelte` を導入していないため、必要になった時に同 PR で `pnpm add -D` してから書く
- Playwright E2E は `web/e2e/*.spec.ts` (未充実、Phase 3 完了後の TODO)
- coverage を **下げない**: `pnpm test:coverage` で line/func 割合を確認、減ったら新規実装側に test 追加

## 参考

- ADR 0007: `docs/adr/0007-tdd-with-vitest-and-playwright.md`
- CLAUDE.md: `### Simplicity First` `### Goal-Driven Execution`
