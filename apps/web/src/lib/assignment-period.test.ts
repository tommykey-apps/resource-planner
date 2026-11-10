import { describe, expect, it } from 'vitest';
import { currentMonthRange, overlapsPeriod } from './assignment-period';

/**
 * アサイン一覧の日付の絞り込み。 期間 [from, to] (両端を含む) とアサインの期間
 * [startDate, endDateExclusive) が 1 日でも重なれば表示する。
 */
const A = { startDate: '2026-10-20', endDateExclusive: '2026-12-01' }; // 10/20 〜 11/30

describe('overlapsPeriod', () => {
	it('期間の指定がなければ表示する', () => {
		expect(overlapsPeriod(A, '', '')).toBe(true);
	});

	it('前の月から続いていて期間内も稼働していれば表示する', () => {
		expect(overlapsPeriod(A, '2026-11-01', '2026-11-30')).toBe(true);
	});

	it('期間を内側に含むアサインも表示する', () => {
		expect(overlapsPeriod(A, '2026-11-10', '2026-11-12')).toBe(true);
	});

	it('期間の開始日より前に終わったアサインは表示しない', () => {
		expect(overlapsPeriod(A, '2026-12-01', '')).toBe(false);
	});

	it('最終日が期間の開始日と同じなら表示する', () => {
		expect(overlapsPeriod(A, '2026-11-30', '')).toBe(true);
	});

	it('期間の終了日より後に始まるアサインは表示しない', () => {
		expect(overlapsPeriod(A, '', '2026-10-19')).toBe(false);
	});

	it('開始日が期間の終了日と同じなら表示する', () => {
		expect(overlapsPeriod(A, '', '2026-10-20')).toBe(true);
	});
});

describe('currentMonthRange', () => {
	it('今日を含む月の初日と末日を返す', () => {
		expect(currentMonthRange(new Date(2026, 10, 5))).toEqual({
			from: '2026-11-01',
			to: '2026-11-30'
		});
	});

	it('31 日の月とうるう年の 2 月も末日を返す', () => {
		expect(currentMonthRange(new Date(2026, 11, 31)).to).toBe('2026-12-31');
		expect(currentMonthRange(new Date(2028, 1, 1)).to).toBe('2028-02-29');
	});
});
