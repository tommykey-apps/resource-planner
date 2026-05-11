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
export type Theme = 'light' | 'dark' | 'system';

export const THEME_COOKIE_NAME = 'mode-watcher-mode';

export function pickTheme(cookieValue: string | null | undefined): Theme {
	if (cookieValue === 'light' || cookieValue === 'dark' || cookieValue === 'system') {
		return cookieValue;
	}
	return 'system';
}
