import { describe, expect, it } from 'vitest';
import { parseProjectPeriod, periodRange, projectIdsInPeriod } from '$lib/features/project/period';

/**
 * 案件一覧の期間の絞り込み (ADR 0016)。 選んだ期間と 1 日でも重なる割り当てを
 * 1 件以上持つ案件を出す。 「すべて」は絞らない。
 */
const TODAY = new Date(2026, 10, 10); // 2026-11-10 (月は 0 始まり)

describe('periodRange', () => {
	it('今日は今日 1 日だけ', () => {
		expect(periodRange('today', TODAY)).toEqual({ from: '2026-11-10', to: '2026-11-10' });
	});

	it('今月は初日から末日', () => {
		expect(periodRange('month', TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
	});

	it('今年は 1/1 から 12/31', () => {
		expect(periodRange('year', TODAY)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
	});

	it('閏年の 2 月は 29 日まで', () => {
		expect(periodRange('month', new Date(2028, 1, 15))).toEqual({
			from: '2028-02-01',
			to: '2028-02-29'
		});
	});

	it('すべては範囲なし', () => {
		expect(periodRange('all', TODAY)).toBeNull();
	});
});

describe('parseProjectPeriod', () => {
	it('URL の値をそのまま使う', () => {
		expect(parseProjectPeriod('today')).toBe('today');
		expect(parseProjectPeriod('year')).toBe('year');
		expect(parseProjectPeriod('all')).toBe('all');
	});

	it('不正な値と空は今月', () => {
		expect(parseProjectPeriod('')).toBe('month');
		expect(parseProjectPeriod('week')).toBe('month');
	});
});

describe('projectIdsInPeriod', () => {
	const assignments = [
		// p1: 10/20 〜 11/30 (前の月から続く)
		{ projectId: 'p1', startDate: '2026-10-20', endDateExclusive: '2026-12-01' },
		// p2: 10/01 〜 10/31 (今月の前日に終わる)
		{ projectId: 'p2', startDate: '2026-10-01', endDateExclusive: '2026-11-01' },
		// p3: 12/01 〜 (今月の翌日に始まる)
		{ projectId: 'p3', startDate: '2026-12-01', endDateExclusive: '2026-12-10' },
		// p4: 今日だけ
		{ projectId: 'p4', startDate: '2026-11-10', endDateExclusive: '2026-11-11' }
	];

	it('今月に重なる割り当てを持つ案件', () => {
		expect(projectIdsInPeriod(assignments, 'month', TODAY)).toEqual(new Set(['p1', 'p4']));
	});

	it('今日に重なる割り当てを持つ案件', () => {
		expect(projectIdsInPeriod(assignments, 'today', TODAY)).toEqual(new Set(['p1', 'p4']));
	});

	it('今年に重なる割り当てを持つ案件', () => {
		expect(projectIdsInPeriod(assignments, 'year', TODAY)).toEqual(
			new Set(['p1', 'p2', 'p3', 'p4'])
		);
	});

	it('割り当てが 0 件の案件は入らない', () => {
		expect(projectIdsInPeriod([], 'year', TODAY)).toEqual(new Set());
	});

	it('すべては絞らない (null)', () => {
		expect(projectIdsInPeriod(assignments, 'all', TODAY)).toBeNull();
	});
});
