/**
 * theme cookie helper (#141)。
 *
 * mode-watcher は localStorage のみで mode を持つので、SSR で初期 theme を知るには
 * ThemeToggle 側で localStorage と同期した cookie を書く必要がある。本ファイルは
 * その cookie 名と server 側のパース関数を提供する。
 *
 * cookie 名は mode-watcher の `modeStorageKey` (デフォルト `mode-watcher-mode`) と揃える
 * — 1 つの kebab-case key で localStorage と cookie の両方を管理する。
 */
import { createInitialModeExpression } from 'mode-watcher';

export type Theme = 'light' | 'dark' | 'system';

export const THEME_COOKIE_NAME = 'mode-watcher-mode';

export function pickTheme(cookieValue: string | null | undefined): Theme {
	if (cookieValue === 'light' || cookieValue === 'dark' || cookieValue === 'system') {
		return cookieValue;
	}
	return 'system';
}

/**
 * app.html の `%modewatcher.snippet%` を mode-watcher の初期化スクリプトに置き換える。
 * `<ModeWatcher>` が自動で挿入する script には SvelteKit の CSP nonce が付かずブロックされるため、
 * nonce 付きの script を app.html に置いて中身だけを差し込む (mode-watcher 公式手順)。
 * https://mode-watcher.svecosystem.com/docs/utilities/create-initial-mode-expression
 */
export function injectInitialModeScript(html: string, theme: Theme): string {
	return html.replace('%modewatcher.snippet%', createInitialModeExpression({ defaultMode: theme }));
}
