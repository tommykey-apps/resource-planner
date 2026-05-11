import { describe, expect, it } from 'vitest';
import { ZOOMS } from '@tommykey-apps/ui-components';
import {
	applyTimelineParams,
	buildTimelineSearch,
	parseTimelineParams
} from './timeline-url-state';

/**
 * #99 item 2: viewport / zoom と URL query の双方向変換テスト。
 *
 * 純粋関数として実装してあるため、ブラウザを起動せず JSON ライクに roundtrip を保証する。
 */
describe('parseTimelineParams', () => {
	it('returns Date and ZoomLevel when both d and z are valid', () => {
		const { viewportStart, zoom } = parseTimelineParams(
			new URLSearchParams('d=2026-05-11&z=week')
		);
		expect(viewportStart?.getFullYear()).toBe(2026);
		expect(viewportStart?.getMonth()).toBe(4); // May (0-indexed)
		expect(viewportStart?.getDate()).toBe(11);
		expect(zoom).toBe(ZOOMS.week);
	});

	it('returns null viewportStart for non-YYYY-MM-DD d value', () => {
		expect(parseTimelineParams(new URLSearchParams('d=2026/05/11')).viewportStart).toBeNull();
		expect(parseTimelineParams(new URLSearchParams('d=not-a-date')).viewportStart).toBeNull();
		expect(parseTimelineParams(new URLSearchParams('')).viewportStart).toBeNull();
	});

	it('returns null zoom for unknown z value', () => {
		expect(parseTimelineParams(new URLSearchParams('z=decade')).zoom).toBeNull();
		expect(parseTimelineParams(new URLSearchParams('')).zoom).toBeNull();
	});

	it('accepts each valid zoom id (day / week / month / year)', () => {
		for (const id of ['day', 'week', 'month', 'year'] as const) {
			const { zoom } = parseTimelineParams(new URLSearchParams(`z=${id}`));
			expect(zoom?.id).toBe(id);
		}
	});
});

describe('buildTimelineSearch', () => {
	it('serializes viewportStart + zoom to "d=YYYY-MM-DD&z={id}"', () => {
		const s = buildTimelineSearch({
			viewportStart: new Date(2026, 4, 11), // May 11 (local)
			zoom: ZOOMS.month
		});
		expect(s).toBe('d=2026-05-11&z=month');
	});

	it('roundtrips through parse → build → parse', () => {
		const state = { viewportStart: new Date(2026, 11, 31), zoom: ZOOMS.year };
		const search = buildTimelineSearch(state);
		const { viewportStart, zoom } = parseTimelineParams(new URLSearchParams(search));
		expect(viewportStart?.getFullYear()).toBe(2026);
		expect(viewportStart?.getMonth()).toBe(11);
		expect(viewportStart?.getDate()).toBe(31);
		expect(zoom).toBe(ZOOMS.year);
	});
});

describe('applyTimelineParams', () => {
	it('updates d and z while preserving other query params', () => {
		const url = new URL('http://localhost/?keep=1&z=day');
		const next = applyTimelineParams(url, {
			viewportStart: new Date(2026, 0, 15),
			zoom: ZOOMS.week
		});
		expect(next.searchParams.get('keep')).toBe('1');
		expect(next.searchParams.get('d')).toBe('2026-01-15');
		expect(next.searchParams.get('z')).toBe('week');
	});

	it('does not mutate the input URL', () => {
		const url = new URL('http://localhost/?z=day');
		applyTimelineParams(url, { viewportStart: new Date(2026, 0, 1), zoom: ZOOMS.month });
		expect(url.searchParams.get('z')).toBe('day');
		expect(url.searchParams.get('d')).toBeNull();
	});
});
