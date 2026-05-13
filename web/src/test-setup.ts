/**
 * Vitest setup file。
 * - `@testing-library/jest-dom` の matcher を Vitest に拡張 (`.toBeDisabled()` 等)
 * - 各 component test ファイル先頭に `// @vitest-environment jsdom` directive を付けて jsdom 化
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// bits-ui v2 の `body-scroll-lock` は Dialog unmount 時に 24ms 遅延の setTimeout で
// document.body のスタイル復元 cleanup を schedule する。 component test 終了で jsdom が
// teardown された後に当該 timer が発火すると `document is not defined` で Unhandled Error が
// 出て CI が exit 1 で落ちる (test 自体は全 pass)。
// 各 test 終了時に短い await で当該 timer を確実に消費させる (jsdom 環境のみ)。
// ref: https://github.com/huntabyte/bits-ui/issues/1639
//      bits-ui/dist/internal/body-scroll-lock.svelte.js (cleanupTimeoutId = setTimeout(cleanupFn, 24))
afterEach(async () => {
	if (typeof document !== 'undefined') {
		await new Promise((resolve) => setTimeout(resolve, 30));
	}
});
