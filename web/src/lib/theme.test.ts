import { describe, expect, it } from 'vitest';
import { injectInitialModeScript, pickTheme, THEME_COOKIE_NAME } from './theme';

/**
 * #141: SSR で theme cookie を読む純粋関数のテスト。
 * mode-watcher の localStorage と並列で書き込んだ cookie 値を server で復元する。
 */
describe('pickTheme (#141)', () => {
	it('returns light / dark / system for valid values', () => {
		expect(pickTheme('light')).toBe('light');
		expect(pickTheme('dark')).toBe('dark');
		expect(pickTheme('system')).toBe('system');
	});

	it('falls back to system for missing or invalid input', () => {
		expect(pickTheme(undefined)).toBe('system');
		expect(pickTheme('')).toBe('system');
		expect(pickTheme('Dark')).toBe('system');
		expect(pickTheme('rainbow')).toBe('system');
	});

	it('uses the mode-watcher cookie name so localStorage and cookie stay aligned', () => {
		expect(THEME_COOKIE_NAME).toBe('mode-watcher-mode');
	});
});

/**
 * mode-watcher の初期化スクリプトを app.html の placeholder に差し込む。
 * 公式手順: https://mode-watcher.svecosystem.com/docs/utilities/create-initial-mode-expression
 */
describe('injectInitialModeScript', () => {
	const html = '<script nonce="abc">%modewatcher.snippet%</script>';

	it('placeholder を初期化スクリプトに置き換える', () => {
		const out = injectInitialModeScript(html, 'dark');
		expect(out).not.toContain('%modewatcher.snippet%');
		expect(out).toContain('localStorage');
	});

	it('cookie から決めた theme を defaultMode に渡す', () => {
		expect(injectInitialModeScript(html, 'dark')).toContain('"defaultMode":"dark"');
		expect(injectInitialModeScript(html, 'light')).toContain('"defaultMode":"light"');
	});

	it('placeholder を含まない chunk はそのまま返す', () => {
		expect(injectInitialModeScript('<div></div>', 'dark')).toBe('<div></div>');
	});
});
