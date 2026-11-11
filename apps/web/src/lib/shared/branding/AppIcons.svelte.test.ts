// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import AppIcons from '$lib/shared/branding/AppIcons.svelte';
import icon from '$lib/shared/branding/icon.svg';
import appleTouchIcon from '$lib/shared/branding/apple-touch-icon.png';

/**
 * タブのアイコンと Apple 用アイコンの <link>。
 *
 * 図は import して、 ビルド時に中身のハッシュ値入りの URL にする (SvelteKit / Vite 公式の推奨)。
 * 図を変えると URL も変わるので、 ブラウザが古いアイコンを持ち続けない。
 * Refs: https://svelte.dev/docs/kit/project-structure#Project-files-static
 */
describe('AppIcons', () => {
	afterEach(() => {
		document.head.innerHTML = '';
	});

	it('タブのアイコンは import した SVG を指す', () => {
		render(AppIcons);
		const link = document.head.querySelector('link[rel="icon"][type="image/svg+xml"]');
		expect(link?.getAttribute('href')).toBe(icon);
		expect(link?.getAttribute('type')).toBe('image/svg+xml');
	});

	it('SVG を使えないブラウザ向けに /favicon.ico も sizes="32x32" 付きで出す', () => {
		// sizes を付けないと Chrome が SVG より ICO を選ぶ (Evil Martians の記事)
		render(AppIcons);
		const link = document.head.querySelector('link[rel="icon"][href="/favicon.ico"]');
		expect(link?.getAttribute('sizes')).toBe('32x32');
	});

	it('Apple 用アイコンは import した 180×180 の PNG を指す', () => {
		render(AppIcons);
		const link = document.head.querySelector('link[rel="apple-touch-icon"]');
		expect(link?.getAttribute('href')).toBe(appleTouchIcon);
	});

	it('manifest は出さない (インストールして使うアプリではないため)', () => {
		render(AppIcons);
		expect(document.head.querySelector('link[rel="manifest"]')).toBeNull();
	});
});
