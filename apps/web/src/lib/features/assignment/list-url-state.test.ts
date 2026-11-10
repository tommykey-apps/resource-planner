import { describe, expect, it } from 'vitest';
import {
	applyAssignmentParams,
	parseAssignmentParams,
	type AssignmentFilters
} from '$lib/features/assignment/list-url-state';

/**
 * #100: /assignments page の filter (q / resourceId / projectId / from / to) を URL に同期。
 * timeline-url-state と同 pattern、純粋関数 + roundtrip test。
 */
const TODAY = new Date(2026, 10, 5);

describe('parseAssignmentParams', () => {
	it('URL に期間のキーがなければ今月の初日と末日を入れる', () => {
		const f = parseAssignmentParams(new URLSearchParams(''), TODAY);
		expect(f).toEqual({
			q: '',
			resourceId: '',
			projectId: '',
			departmentId: '',
			from: '2026-11-01',
			to: '2026-11-30'
		});
	});

	it('期間のキーが空なら制限なしとして扱い、 今月を入れない', () => {
		const f = parseAssignmentParams(new URLSearchParams('from=&to='), TODAY);
		expect(f.from).toBe('');
		expect(f.to).toBe('');
	});

	it('期間のキーが片方だけでも、 指定を優先して今月を入れない', () => {
		const f = parseAssignmentParams(new URLSearchParams('from=2026-05-01'), TODAY);
		expect(f.from).toBe('2026-05-01');
		expect(f.to).toBe('');
	});

	it('returns filters from valid params', () => {
		const f = parseAssignmentParams(
			new URLSearchParams(
				'q=alice&resourceId=r1&projectId=p1&departmentId=d1&from=2026-05-01&to=2026-05-31'
			),
			TODAY
		);
		expect(f).toEqual({
			q: 'alice',
			resourceId: 'r1',
			projectId: 'p1',
			departmentId: 'd1',
			from: '2026-05-01',
			to: '2026-05-31'
		});
	});

	it('ignores invalid date format', () => {
		const f = parseAssignmentParams(new URLSearchParams('from=invalid&to=2026/13/40'), TODAY);
		expect(f.from).toBe('');
		expect(f.to).toBe('');
	});
});

describe('applyAssignmentParams', () => {
	it('writes non-empty filter values, omitting empties except the period keys', () => {
		const url = new URL('http://localhost/assignments?keep=1');
		const filters: AssignmentFilters = {
			q: 'alice',
			resourceId: 'r1',
			projectId: '',
			departmentId: 'd1',
			from: '2026-05-01',
			to: ''
		};
		const next = applyAssignmentParams(url, filters);
		expect(next.searchParams.get('keep')).toBe('1');
		expect(next.searchParams.get('q')).toBe('alice');
		expect(next.searchParams.get('resourceId')).toBe('r1');
		expect(next.searchParams.get('projectId')).toBeNull();
		expect(next.searchParams.get('departmentId')).toBe('d1');
		expect(next.searchParams.get('from')).toBe('2026-05-01');
		// 空にした期間は「制限なし」 を選んだ印として空のキーで残す (再読み込みで今月に戻さない)
		expect(next.searchParams.get('to')).toBe('');
	});

	it('removes a previously set param when filter value becomes empty', () => {
		const url = new URL('http://localhost/assignments?q=old');
		const next = applyAssignmentParams(url, {
			q: '',
			resourceId: '',
			projectId: '',
			departmentId: '',
			from: '',
			to: ''
		});
		expect(next.searchParams.get('q')).toBeNull();
	});

	it('does not mutate the input URL', () => {
		const url = new URL('http://localhost/assignments?q=before');
		applyAssignmentParams(url, {
			q: 'after',
			resourceId: '',
			projectId: '',
			departmentId: '',
			from: '',
			to: ''
		});
		expect(url.searchParams.get('q')).toBe('before');
	});

	it('roundtrips through parse → apply → parse (未所属 sentinel 含む)', () => {
		const original: AssignmentFilters = {
			q: 'meeting',
			resourceId: 'r1',
			projectId: 'p1',
			departmentId: '__unassigned__',
			from: '2026-05-01',
			to: '2026-05-31'
		};
		const url = applyAssignmentParams(new URL('http://localhost/assignments'), original);
		const parsed = parseAssignmentParams(url.searchParams, TODAY);
		expect(parsed).toEqual(original);
	});

	it('期間を空にした状態も roundtrip で空のまま戻る', () => {
		const original: AssignmentFilters = {
			q: '',
			resourceId: '',
			projectId: '',
			departmentId: '',
			from: '',
			to: ''
		};
		const url = applyAssignmentParams(new URL('http://localhost/assignments'), original);
		expect(parseAssignmentParams(url.searchParams, TODAY)).toEqual(original);
	});
});
