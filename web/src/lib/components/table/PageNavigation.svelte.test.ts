// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PageNavigation from './PageNavigation.svelte';

/**
 * デジタル庁「ページナビゲーション」(テキスト型):
 * - URL が変わるので <a> を使う
 * - 合計 1 ページなら出さない
 * - 最初のページで「前のページ」、 最後のページで「次のページ」を出さない (disabled は使わない)
 * - nav の aria-label は対象の名前 (「ページネーション」のような冗長な語を避ける)
 */
const hrefFor = (n: number) => `/resources?page=${n}`;

describe('PageNavigation', () => {
	it('1ページしかなければ何も出さない', () => {
		const { queryByRole } = render(PageNavigation, {
			props: { page: 1, pageCount: 1, hrefFor, label: 'メンバー' }
		});
		expect(queryByRole('navigation')).toBeNull();
	});

	it('最初のページでは「前のページ」を出さない', () => {
		const { getByRole, queryByRole } = render(PageNavigation, {
			props: { page: 1, pageCount: 3, hrefFor, label: 'メンバー' }
		});
		expect(getByRole('navigation', { name: 'メンバー' })).toBeInTheDocument();
		expect(queryByRole('link', { name: '前のページ' })).toBeNull();
		expect(getByRole('link', { name: '次のページ' }).getAttribute('href')).toBe(
			'/resources?page=2'
		);
		expect(getByRole('navigation').textContent).toContain('1 / 3');
	});

	it('途中のページでは前後どちらも出す', () => {
		const { getByRole } = render(PageNavigation, {
			props: { page: 2, pageCount: 3, hrefFor, label: 'メンバー' }
		});
		expect(getByRole('link', { name: '前のページ' }).getAttribute('href')).toBe(
			'/resources?page=1'
		);
		expect(getByRole('link', { name: '次のページ' }).getAttribute('href')).toBe(
			'/resources?page=3'
		);
	});

	it('最後のページでは「次のページ」を出さない', () => {
		const { queryByRole } = render(PageNavigation, {
			props: { page: 3, pageCount: 3, hrefFor, label: 'メンバー' }
		});
		expect(queryByRole('link', { name: '次のページ' })).toBeNull();
	});
});
