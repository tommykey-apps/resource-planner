import { describe, expect, it } from 'vitest';
import {
	PAGE_SIZE,
	applyListQuery,
	nextSort,
	paginate,
	parseListQuery,
	sortRows,
	type ListQuery
} from './list-table';

const SORT_KEYS = ['name', 'assignments'] as const;
type Key = (typeof SORT_KEYS)[number];
const DEFAULTS: ListQuery<Key> = { q: '', sort: 'name', dir: 'asc', page: 1 };

describe('parseListQuery', () => {
	it('クエリが無ければ既定値', () => {
		expect(parseListQuery(new URLSearchParams(), SORT_KEYS, DEFAULTS)).toEqual(DEFAULTS);
	});

	it('q / sort / dir / page を読む', () => {
		const p = new URLSearchParams('q=佐藤&sort=assignments&dir=desc&page=3');
		expect(parseListQuery(p, SORT_KEYS, DEFAULTS)).toEqual({
			q: '佐藤',
			sort: 'assignments',
			dir: 'desc',
			page: 3
		});
	});

	it('未知の sort / dir、 不正な page は既定値に戻す', () => {
		const p = new URLSearchParams('sort=evil&dir=sideways&page=-2');
		expect(parseListQuery(p, SORT_KEYS, DEFAULTS)).toEqual(DEFAULTS);
		expect(parseListQuery(new URLSearchParams('page=abc'), SORT_KEYS, DEFAULTS).page).toBe(1);
		expect(parseListQuery(new URLSearchParams('page=1.5'), SORT_KEYS, DEFAULTS).page).toBe(1);
	});
});

describe('applyListQuery', () => {
	it('既定値と同じ値は URL から消し、 他の query は残す', () => {
		const url = new URL('http://x/resources?dept=d1&q=old&page=2');
		const next = applyListQuery(url, DEFAULTS, DEFAULTS);
		expect(next.search).toBe('?dept=d1');
	});

	it('既定値と違う値だけ書く', () => {
		const next = applyListQuery(
			new URL('http://x/resources'),
			{ q: 'a', sort: 'assignments', dir: 'desc', page: 2 },
			DEFAULTS
		);
		expect(Object.fromEntries(next.searchParams)).toEqual({
			q: 'a',
			sort: 'assignments',
			dir: 'desc',
			page: '2'
		});
	});

	it('parse と往復できる', () => {
		const q: ListQuery<Key> = { q: 'x y', sort: 'name', dir: 'desc', page: 4 };
		const url = applyListQuery(new URL('http://x/'), q, DEFAULTS);
		expect(parseListQuery(url.searchParams, SORT_KEYS, DEFAULTS)).toEqual(q);
	});
});

describe('nextSort', () => {
	it('同じ列なら向きを反転、 別の列なら昇順', () => {
		expect(nextSort({ sort: 'name', dir: 'asc' }, 'name')).toEqual({ sort: 'name', dir: 'desc' });
		expect(nextSort({ sort: 'name', dir: 'desc' }, 'name')).toEqual({ sort: 'name', dir: 'asc' });
		expect(nextSort({ sort: 'name', dir: 'desc' }, 'assignments')).toEqual({
			sort: 'assignments',
			dir: 'asc'
		});
	});
});

describe('sortRows', () => {
	const rows = [
		{ name: '鈴木', n: 2 },
		{ name: 'item10', n: 10 },
		{ name: 'item2', n: 1 },
		{ name: '佐藤', n: 2 }
	];

	it('文字列は数字を数値として比較する (item2 < item10)', () => {
		const names = sortRows(rows, (r) => r.name, 'asc', 'ja').map((r) => r.name);
		expect(names.indexOf('item2')).toBeLessThan(names.indexOf('item10'));
	});

	it('数値は大小で並べ、 降順にもできる', () => {
		expect(sortRows(rows, (r) => r.n, 'desc', 'ja').map((r) => r.n)).toEqual([10, 2, 2, 1]);
	});

	it('同値は元の順を保つ (安定ソート)', () => {
		const twos = sortRows(rows, (r) => r.n, 'asc', 'ja').filter((r) => r.n === 2);
		expect(twos.map((r) => r.name)).toEqual(['鈴木', '佐藤']);
	});

	it('元の配列を変えない', () => {
		const copy = [...rows];
		sortRows(rows, (r) => r.n, 'asc', 'ja');
		expect(rows).toEqual(copy);
	});
});

describe('paginate', () => {
	const rows = Array.from({ length: PAGE_SIZE * 2 + 5 }, (_, i) => i);

	it('1ページ目は先頭 PAGE_SIZE 件', () => {
		const r = paginate(rows, 1);
		expect(r.items).toHaveLength(PAGE_SIZE);
		expect(r.items[0]).toBe(0);
		expect(r.pageCount).toBe(3);
		expect(r.page).toBe(1);
	});

	it('最後のページは端数', () => {
		const r = paginate(rows, 3);
		expect(r.items).toEqual([PAGE_SIZE * 2, ...rows.slice(PAGE_SIZE * 2 + 1)]);
	});

	it('範囲外のページは最後のページに丸める', () => {
		expect(paginate(rows, 99).page).toBe(3);
	});

	it('0件でも 1 ページとして扱う', () => {
		expect(paginate([], 1)).toEqual({ items: [], page: 1, pageCount: 1 });
	});

	it('1ページの件数は 10 件より多い (DESIGN.md: 一覧を10行で切らない)', () => {
		expect(PAGE_SIZE).toBeGreaterThan(10);
	});
});
