import { describe, expect, it } from 'vitest';
import type { Assignment as DbAssignment } from './types';
import { fromTimelineAssignment, toTimelineAssignment } from './timeline-adapter';

const sampleDb: DbAssignment = {
	id: 'a1',
	resourceId: 'r1',
	projectId: 'p1',
	startDate: '2026-05-01',
	endDateExclusive: '2026-06-01'
};

describe('toTimelineAssignment', () => {
	it('composes label + color from project, parses dates', () => {
		const t = toTimelineAssignment(sampleDb, { name: 'Project One', color: '#ff0000' });
		expect(t.id).toBe('a1');
		expect(t.resourceId).toBe('r1');
		expect(t.label).toBe('Project One');
		expect(t.color).toBe('#ff0000');
		expect(t.startDate).toBeInstanceOf(Date);
		expect(t.endDate).toBeInstanceOf(Date);
		expect(t.startDate.getFullYear()).toBe(2026);
		expect(t.startDate.getMonth()).toBe(4); // 0-indexed: May
		expect(t.startDate.getDate()).toBe(1);
		expect(t.endDate.getMonth()).toBe(5); // 0-indexed: June
		expect(t.endDate.getDate()).toBe(1);
	});

	it('falls back to undefined label/color when project is missing', () => {
		const t = toTimelineAssignment(sampleDb, undefined);
		expect(t.label).toBeUndefined();
		expect(t.color).toBeUndefined();
		expect(t.id).toBe('a1');
	});
});

describe('fromTimelineAssignment', () => {
	it('formats Date back to YYYY-MM-DD and preserves projectId from prev', () => {
		const t = {
			id: 'a1',
			resourceId: 'r2',
			startDate: new Date(2026, 5, 15), // 2026-06-15
			endDate: new Date(2026, 6, 1) // 2026-07-01
		};
		const result = fromTimelineAssignment(t, sampleDb);
		expect(result).toEqual({
			id: 'a1',
			resourceId: 'r2',
			projectId: 'p1', // preserved from prev (timeline has no projectId)
			startDate: '2026-06-15',
			endDateExclusive: '2026-07-01'
		});
	});

	it('survives a roundtrip (db -> timeline -> db) without drift', () => {
		const project = { name: 'P', color: '#000000' };
		const t = toTimelineAssignment(sampleDb, project);
		const back = fromTimelineAssignment(t, sampleDb);
		expect(back).toEqual(sampleDb);
	});
});
