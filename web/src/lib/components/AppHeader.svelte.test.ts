// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppHeader from './AppHeader.svelte';

/**
 * #136 / #146 / header 標準化: 共通 Header の振る舞い契約。
 *
 * デジタル庁デザインシステム「ヘッダーコンテナ」の構成に揃える:
 *   ロゴ (左) + 水平メニュー (グローバルナビ) + ヘッダーコンテナアイテム (言語切替 / アカウント) +
 *   狭い画面ではハンバーガーメニューボタン。
 * 画面固有の操作 (アサイン追加など) と master 管理の起動ボタンはヘッダーに置かない。
 * 現在地は `page.url.pathname` から判定するので `$app/state` を mock する。
 */

const pageState = vi.hoisted(() => ({ url: new URL('http://localhost/') }));
vi.mock('$app/state', () => ({ page: pageState }));

const stubProps = (overrides: { email?: string } = {}) => ({
	props: {
		user: { email: overrides.email ?? 'alice@example.com' },
		csrfToken: 'test-csrf-token'
	}
});

function setPath(path: string) {
	pageState.url = new URL(`http://localhost${path}`);
}

const NAV_ITEMS = [
	{ href: '/', label: /タイムライン/ },
	{ href: '/assignments', label: /アサイン一覧/ },
	{ href: '/resources', label: /^メンバー$/ },
	{ href: '/projects', label: /^案件$/ },
	{ href: '/departments', label: /^部署$/ }
];

beforeEach(() => setPath('/'));

describe('AppHeader — branding logo (#146)', () => {
	it('logo img は alt="" (隣のアプリ名と同じ意味なので装飾扱い、 SR 重複読み回避)', () => {
		const { container } = render(AppHeader, stubProps());
		const img = container.querySelector('img');
		expect(img).toBeTruthy();
		expect(img?.getAttribute('alt')).toBe('');
	});

	it('logo img は width / height 属性で CLS 防止 (Core Web Vitals)', () => {
		const { container } = render(AppHeader, stubProps());
		const img = container.querySelector('img');
		expect(img?.getAttribute('width')).toBe('32');
		expect(img?.getAttribute('height')).toBe('32');
	});

	it('logo + アプリ名は <a href="/"> で wrap して home へ navigation', () => {
		const { container } = render(AppHeader, stubProps());
		const anchor = container.querySelector('img')?.closest('a');
		expect(anchor?.getAttribute('href')).toBe('/');
	});
});

describe('AppHeader — 水平メニュー (グローバルナビ)', () => {
	it('nav landmark に 5 つの上位区画 link を並べる', () => {
		const { getByRole } = render(AppHeader, stubProps());
		const nav = getByRole('navigation', { name: 'メインメニュー' });
		const links = Array.from(nav.querySelectorAll('a'));
		expect(links.map((a) => a.getAttribute('href'))).toEqual(NAV_ITEMS.map((i) => i.href));
		NAV_ITEMS.forEach((item, i) => expect(links[i].textContent?.trim()).toMatch(item.label));
	});

	it.each(NAV_ITEMS)('pathname=$href のとき該当 link だけ aria-current="page"', ({ href }) => {
		setPath(href);
		const { getByRole } = render(AppHeader, stubProps());
		const nav = getByRole('navigation', { name: 'メインメニュー' });
		const current = nav.querySelectorAll('a[aria-current="page"]');
		expect(current).toHaveLength(1);
		expect(current[0].getAttribute('href')).toBe(href);
	});

	it('配下の path (/resources/x) でも上位区画を現在地にする', () => {
		setPath('/resources/x');
		const { getByRole } = render(AppHeader, stubProps());
		const nav = getByRole('navigation', { name: 'メインメニュー' });
		expect(nav.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe('/resources');
	});

	it('ナビ項目は link で、 button や件数付きラベルを持たない', () => {
		const { getByRole } = render(AppHeader, stubProps());
		const nav = getByRole('navigation', { name: 'メインメニュー' });
		expect(nav.querySelectorAll('button')).toHaveLength(0);
		expect(nav.textContent).not.toMatch(/\(\d+\)/);
	});
});

describe('AppHeader — ヘッダーに置かないもの', () => {
	it('master 管理の起動 button / アサイン追加 button を持たない', () => {
		const { queryByRole } = render(AppHeader, stubProps());
		expect(queryByRole('button', { name: /管理/ })).toBeNull();
		expect(queryByRole('button', { name: /アサインを追加/ })).toBeNull();
	});

	it('テーマ切替 button はヘッダーに直接置かない (アバターメニューへ集約)', () => {
		const { queryByRole } = render(AppHeader, stubProps());
		expect(queryByRole('button', { name: /テーマ/ })).toBeNull();
	});
});

describe('AppHeader — ヘッダーコンテナアイテム', () => {
	it('言語切替を置く', () => {
		const { getByRole } = render(AppHeader, stubProps());
		expect(getByRole('button', { name: '言語' })).toBeInTheDocument();
	});

	it('AvatarDropdown は user.email を受け取り、 trigger に email 先頭文字を表示', () => {
		const { container } = render(AppHeader, stubProps({ email: 'bob@example.com' }));
		const avatar = container.querySelector(
			'button[aria-label*="bob@example.com"]'
		) as HTMLButtonElement | null;
		expect(avatar).toBeTruthy();
		expect(avatar?.textContent?.trim()).toBe('B');
	});

	it('header 内に sticky bar が 1 つだけ (重複 header を防ぐ)', () => {
		const { container } = render(AppHeader, stubProps());
		expect(container.querySelectorAll('header')).toHaveLength(1);
	});
});

describe('AppHeader — ハンバーガーメニューボタン (狭い画面)', () => {
	it('aria-expanded=false + aria-controls で水平メニューを指す', () => {
		const { getByRole } = render(AppHeader, stubProps());
		const toggle = getByRole('button', { name: 'メニュー' });
		const nav = getByRole('navigation', { name: 'メインメニュー' });
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(toggle.getAttribute('aria-controls')).toBe(nav.id);
	});

	it('click で aria-expanded が切り替わる', async () => {
		const { getByRole } = render(AppHeader, stubProps());
		const toggle = getByRole('button', { name: 'メニュー' });
		await fireEvent.click(toggle);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		await fireEvent.click(toggle);
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
	});

	it('開いた状態でナビ link を押すとメニューを閉じる', async () => {
		const { getByRole } = render(AppHeader, stubProps());
		const toggle = getByRole('button', { name: 'メニュー' });
		await fireEvent.click(toggle);
		const nav = getByRole('navigation', { name: 'メインメニュー' });
		await fireEvent.click(nav.querySelector('a[href="/projects"]') as HTMLElement);
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
	});
});
