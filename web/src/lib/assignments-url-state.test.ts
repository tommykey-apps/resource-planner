import { describe, expect, it } from 'vitest';
import {
	applyAssignmentParams,
	parseAssignmentParams,
	type AssignmentFilters
} from './assignments-url-state';

/**
 * #100: /assignments page の filter (q / resourceId / projectId / from / to) を URL に同期。
 * timeline-url-state と同 pattern、純粋関数 + roundtrip test。
 */
describe('parseAssignmentParams', () => {
	it('returns empty filters when no params', () => {
		const f = parseAssignmentParams(new URLSearchParams(''));
		expect(f).toEqual({
			q: '',
			resourceId: '',
			projectId: '',
			from: '',
			to: ''
		});
	});

	it('returns filters from valid params', () => {
		const f = parseAssignmentParams(
			new URLSearchParams('q=alice&resourceId=r1&projectId=p1&from=2026-05-01&to=2026-05-31')
		);
		expect(f).toEqual({
			q: 'alice',
			resourceId: 'r1',
			projectId: 'p1',
			from: '2026-05-01',
			to: '2026-05-31'
		});
	});

	it('ignores invalid date format', () => {
		const f = parseAssignmentParams(new URLSearchParams('from=invalid&to=2026/13/40'));
		expect(f.from).toBe('');
		expect(f.to).toBe('');
	});

	it('preserves valid date format', () => {
		const f = parseAssignmentParams(new URLSearchParams('from=2026-05-01'));
		expect(f.from).toBe('2026-05-01');
	});
});

describe('applyAssignmentParams', () => {
	it('writes all non-empty filter values to URL search params, omitting empties', () => {
		const url = new URL('http://localhost/assignments?keep=1');
		const filters: AssignmentFilters = {
			q: 'alice',
			resourceId: 'r1',
			projectId: '',
			from: '2026-05-01',
			to: ''
		};
		const next = applyAssignmentParams(url, filters);
		expect(next.searchParams.get('keep')).toBe('1');
		expect(next.searchParams.get('q')).toBe('alice');
		expect(next.searchParams.get('resourceId')).toBe('r1');
		expect(next.searchParams.get('projectId')).toBeNull();
		expect(next.searchParams.get('from')).toBe('2026-05-01');
		expect(next.searchParams.get('to')).toBeNull();
	});

	it('removes a previously set param when filter value becomes empty', () => {
		const url = new URL('http://localhost/assignments?q=old');
		const next = applyAssignmentParams(url, {
			q: '',
			resourceId: '',
			projectId: '',
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
			from: '',
			to: ''
		});
		expect(url.searchParams.get('q')).toBe('before');
	});

	it('roundtrips through parse → apply → parse', () => {
		const original: AssignmentFilters = {
			q: 'meeting',
			resourceId: 'r1',
			projectId: 'p1',
			from: '2026-05-01',
			to: '2026-05-31'
		};
		const url = applyAssignmentParams(new URL('http://localhost/assignments'), original);
		const parsed = parseAssignmentParams(url.searchParams);
		expect(parsed).toEqual(original);
	});
});
