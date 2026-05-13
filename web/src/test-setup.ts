/**
 * Vitest setup file。
 * - `@testing-library/jest-dom` の matcher を Vitest に拡張 (`.toBeDisabled()` 等)
 * - 各 component test ファイル先頭に `// @vitest-environment jsdom` directive を付けて jsdom 化
 * - bits-ui の body-scroll-lock teardown race のみ握り潰す (下記参照)
 */
import '@testing-library/jest-dom/vitest';

/**
 * bits-ui v2 (>= 2.18.0) Dialog 系は内部で `BodyScrollLock` を使い、 unmount 時に
 * 24ms 遅延の `setTimeout` で document.body スタイル復元 cleanup を schedule する
 * (実機 race condition 解消のため意図的に導入、 PR https://github.com/huntabyte/bits-ui/pull/1700)。
 *
 * component test 終了で jsdom が teardown された後にこの timer が Node の event loop で
 * 発火すると、 cleanup 内の `if (!BROWSER) return` ガードが import-time の静的値を
 * 参照しているため通過してしまい、 既に消えた `document.body.setAttribute(...)` で
 * `ReferenceError: document is not defined` が出て vitest が exit 1 で落ちる
 * (test 自体は全 pass)。
 *
 * 根本原因の交差点 (3 層):
 *   - jsdom #955  : window.close 後の timer 残留 (2014 以来 open)
 *   - vitest #5414: teardown 後の timer error sink 改善 (議論中)
 *   - bits-ui PR #1700: v2.18.0 で 24ms cleanup を導入 (実機 race のため必要)
 *
 * 2026-05-13 時点でこの 3 層交差点を踏んだ具体 stack を報告した公開事例 0 件
 * (我々の調査結果)。 upstream fix の見通しなし、 短期的に解消するには test 側で
 * 対処するしかない。
 *
 * 採用 workaround:
 *   `vi.mock('bits-ui/dist/internal/body-scroll-lock.svelte.js', ...)` は bits-ui の
 *   `exports` field で internal path がマスクされているため不可。
 *   `vi.mock('bits-ui', ...)` で全体差し替えは Dialog 本体まで失う。
 *   vitest 4.1.5 の config には narrow filter API なし (`dangerouslyIgnoreUnhandledErrors`
 *   は broad、 `trackUnhandledErrors: false` も broad、 `onUnhandledError` は内部 RPC で
 *   user 公開なし)。
 *   よって **当該 stack に完全一致する ReferenceError のみを** `process.on('uncaughtException')`
 *   で握り潰す target-narrow 方式を採用する。 他のエラー / message / stack は throw を維持し、
 *   真の bug は引き続き検出可能。
 *
 * 重複登録について:
 *   vitest 4 のデフォルト pool は `forks` (child_process)。 setupFiles は worker process
 *   ごとに 1 回評価されるため、 process.on は worker scope で 1 回のみ登録される
 *   (test file ごとに重複登録されることはない)。 pool を `threads` 等に変更する場合は
 *   この前提が崩れるので、 hot-path 設定変更時は要確認。
 *
 * handler 内 throw の挙動:
 *   Node 仕様で `uncaughtException` handler 内の throw は再 catch されず process が
 *   非ゼロ終了する ("last resort" semantics、 https://nodejs.org/api/process.html#event-uncaughtexception)。
 *   vitest worker は子 process の exit code で fail を検出するため結果として test fail
 *   になり、 元の挙動を保つ。
 *
 * 参考:
 * - https://github.com/jsdom/jsdom/issues/955
 * - https://github.com/vitest-dev/vitest/issues/5414
 * - https://github.com/vitest-dev/vitest/pull/2971
 * - https://github.com/huntabyte/bits-ui/pull/1700
 */
process.on('uncaughtException', (err: unknown) => {
	if (
		err instanceof ReferenceError &&
		err.message.includes('document is not defined') &&
		typeof err.stack === 'string' &&
		err.stack.includes('body-scroll-lock')
	) {
		// known race: bits-ui の cleanup timer が jsdom teardown 後に発火、 既知の harmless flake。
		return;
	}
	// 他の uncaughtException は元の vitest 挙動を維持 (rethrow で fail させる)。
	throw err;
});
