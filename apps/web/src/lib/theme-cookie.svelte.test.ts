// @vitest-environment jsdom
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncThemeCookie } from './theme-cookie.svelte';

/**
 * #141 / header 標準化: userPrefersMode → cookie ミラーを ThemeToggle から切り出す。
 * テーマはヘッダー (アバターメニュー) と sign-in 画面の 2 箇所で変えられるので、
 * root layout で 1 回だけ同期する。
 */
const prefers = vi.hoisted(() => ({ current: 'dark' as 'light' | 'dark' | 'system' }));
vi.mock('mode-watcher', () => ({ userPrefersMode: prefers }));

afterEach(() => {
	document.cookie = 'mode-watcher-mode=; max-age=0; path=/';
});

describe('syncThemeCookie', () => {
	it('userPrefersMode の値を mode-watcher-mode cookie に書く', () => {
		const cleanup = $effect.root(() => syncThemeCookie());
		flushSync();
		expect(document.cookie).toContain('mode-watcher-mode=dark');
		cleanup();
	});
});
