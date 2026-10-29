// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createListQuery } from './list-query.svelte';

/**
 * 一覧の表の状態 (q / sort / dir / page) を URL query から読み、 URL を書き換えて更新する。
 * SvelteKit 公式 state-management「URL を状態の置き場にする」に従い、 状態は URL にだけ持つ。
 */
const pageState = vi.hoisted(() => ({ url: new URL('http://localhost/resources') }));
vi.mock('$app/state', () => ({ page: pageState }));
const goto = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto }));

const KEYS = ['name', 'assignments'] as const;
const DEFAULTS = { q: '', sort: 'name' as const, dir: 'asc' as const, page: 1 };

beforeEach(() => {
	goto.mockClear();
	pageState.url = new URL('http://localhost/resources');
});

describe('createListQuery', () => {
	it('現在の URL から状態を読む', () => {
		pageState.url = new URL('http://localhost/resources?q=a&sort=assignments&dir=desc&page=2');
		const lq = createListQuery(KEYS, DEFAULTS);
		expect(lq.current).toEqual({ q: 'a', sort: 'assignments', dir: 'desc', page: 2 });
	});

	it('update は履歴を積まずに URL を書き換え、 focus とスクロール位置を保つ', () => {
		pageState.url = new URL('http://localhost/resources?dept=d1');
		const lq = createListQuery(KEYS, DEFAULTS);
		lq.update({ q: 'bob', page: 1 });
		expect(goto).toHaveBeenCalledWith('/resources?dept=d1&q=bob', {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	});

	it('hrefFor はページ番号だけ差し替えた相対 URL を返す', () => {
		pageState.url = new URL('http://localhost/resources?q=a&page=2');
		const lq = createListQuery(KEYS, DEFAULTS);
		expect(lq.hrefFor(3)).toBe('/resources?q=a&page=3');
		expect(lq.hrefFor(1)).toBe('/resources?q=a');
	});

	it('画面固有の絞り込み (部署など) も URL で読み書きし、 変えたら 1 ページ目に戻す', () => {
		pageState.url = new URL('http://localhost/resources?page=3');
		const lq = createListQuery(KEYS, DEFAULTS, ['dept']);
		expect(lq.filter('dept')).toBe('');
		lq.setFilter('dept', 'd1');
		expect(goto).toHaveBeenCalledWith('/resources?dept=d1', expect.anything());
		pageState.url = new URL('http://localhost/resources?dept=d1');
		expect(lq.filter('dept')).toBe('d1');
		lq.setFilter('dept', '');
		expect(goto).toHaveBeenLastCalledWith('/resources', expect.anything());
	});

	it('clearFilters は q と画面固有の絞り込みを消し、 並び順は残す', () => {
		pageState.url = new URL('http://localhost/resources?q=a&dept=d1&sort=assignments&page=2');
		const lq = createListQuery(KEYS, DEFAULTS, ['dept']);
		lq.clearFilters();
		expect(goto).toHaveBeenCalledWith('/resources?sort=assignments', expect.anything());
	});
});
