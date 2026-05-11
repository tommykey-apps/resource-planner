import { describe, expect, it } from 'vitest';
import {
	assignmentApiUpdateSchema,
	assignmentCreateSchema,
	assignmentUpdateSchema,
	assignmentFormUpdateSchema,
	projectCreateSchema,
	projectUpdateSchema,
	resourceCreateSchema,
	resourceUpdateSchema
} from './index';

describe('resourceCreateSchema', () => {
	it('accepts a valid name', () => {
		expect(resourceCreateSchema.safeParse({ name: 'Alice' }).success).toBe(true);
	});

	it('rejects empty name', () => {
		const r = resourceCreateSchema.safeParse({ name: '' });
		expect(r.success).toBe(false);
	});

	it('rejects name longer than 100 chars', () => {
		const r = resourceCreateSchema.safeParse({ name: 'a'.repeat(101) });
		expect(r.success).toBe(false);
	});

	it('accepts name of exactly 100 chars', () => {
		expect(resourceCreateSchema.safeParse({ name: 'a'.repeat(100) }).success).toBe(true);
	});
});

describe('resourceUpdateSchema', () => {
	it('requires id in addition to name', () => {
		expect(resourceUpdateSchema.safeParse({ name: 'Alice' }).success).toBe(false);
		expect(resourceUpdateSchema.safeParse({ id: 'r1', name: 'Alice' }).success).toBe(true);
	});

	it('rejects empty id', () => {
		expect(resourceUpdateSchema.safeParse({ id: '', name: 'Alice' }).success).toBe(false);
	});
});

describe('projectCreateSchema', () => {
	it('accepts a valid name + color', () => {
		expect(projectCreateSchema.safeParse({ name: 'P1', color: '#abcdef' }).success).toBe(true);
		expect(projectCreateSchema.safeParse({ name: 'P1', color: '#ABCDEF' }).success).toBe(true);
		expect(projectCreateSchema.safeParse({ name: 'P1', color: '#000000' }).success).toBe(true);
	});

	it('rejects color without leading #', () => {
		expect(projectCreateSchema.safeParse({ name: 'P1', color: 'abcdef' }).success).toBe(false);
	});

	it('rejects color with shorthand 3-digit form', () => {
		expect(projectCreateSchema.safeParse({ name: 'P1', color: '#abc' }).success).toBe(false);
	});

	it('rejects color with non-hex characters', () => {
		expect(projectCreateSchema.safeParse({ name: 'P1', color: '#zzzzzz' }).success).toBe(false);
	});
});

describe('projectUpdateSchema', () => {
	it('requires id', () => {
		expect(projectUpdateSchema.safeParse({ name: 'P1', color: '#abcdef' }).success).toBe(false);
		expect(projectUpdateSchema.safeParse({ id: 'p1', name: 'P1', color: '#abcdef' }).success).toBe(
			true
		);
	});
});

describe('assignmentCreateSchema', () => {
	const valid = {
		resourceId: 'r1',
		projectId: 'p1',
		startDate: '2026-05-01',
		endDate: '2026-05-31'
	};

	it('transforms inclusive endDate to exclusive endDateExclusive (+1 day)', () => {
		const r = assignmentCreateSchema.safeParse(valid);
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data).toEqual({
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-06-01'
		});
	});

	it('transforms across month boundary correctly', () => {
		const r = assignmentCreateSchema.safeParse({
			...valid,
			startDate: '2026-01-01',
			endDate: '2026-01-31'
		});
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data.endDateExclusive).toBe('2026-02-01');
	});

	it('accepts startDate == endDate (single-day assignment)', () => {
		const r = assignmentCreateSchema.safeParse({
			...valid,
			startDate: '2026-05-01',
			endDate: '2026-05-01'
		});
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data.endDateExclusive).toBe('2026-05-02');
	});

	it('rejects startDate > endDate with path = ["endDate"]', () => {
		const r = assignmentCreateSchema.safeParse({
			...valid,
			startDate: '2026-05-31',
			endDate: '2026-05-01'
		});
		expect(r.success).toBe(false);
		if (r.success) return;
		expect(r.error.issues[0].path).toEqual(['endDate']);
	});

	it('rejects malformed startDate (not YYYY-MM-DD)', () => {
		expect(assignmentCreateSchema.safeParse({ ...valid, startDate: '2026/5/1' }).success).toBe(
			false
		);
	});

	it('rejects empty resourceId / projectId', () => {
		expect(assignmentCreateSchema.safeParse({ ...valid, resourceId: '' }).success).toBe(false);
		expect(assignmentCreateSchema.safeParse({ ...valid, projectId: '' }).success).toBe(false);
	});
});

describe('assignmentUpdateSchema', () => {
	it('requires id and applies the same +1-day transform', () => {
		const r = assignmentUpdateSchema.safeParse({
			id: 'a1',
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-01',
			endDate: '2026-05-31'
		});
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data).toEqual({
			id: 'a1',
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-06-01'
		});
	});

	it('rejects missing id', () => {
		expect(
			assignmentUpdateSchema.safeParse({
				resourceId: 'r1',
				projectId: 'p1',
				startDate: '2026-05-01',
				endDate: '2026-05-31'
			}).success
		).toBe(false);
	});
});

describe('assignmentFormUpdateSchema (#99)', () => {
	const valid = {
		id: 'a1',
		resourceId: 'r1',
		projectId: 'p1',
		prevStartDate: '2026-05-01',
		startDate: '2026-05-03',
		endDate: '2026-05-09'
	};

	it('splits prevStartDate from payload and applies the +1-day transform', () => {
		const r = assignmentFormUpdateSchema.safeParse(valid);
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data).toEqual({
			prevStartDate: '2026-05-01',
			payload: {
				id: 'a1',
				resourceId: 'r1',
				projectId: 'p1',
				startDate: '2026-05-03',
				endDateExclusive: '2026-05-10'
			}
		});
	});

	it('rejects when prevStartDate is not YYYY-MM-DD', () => {
		const r = assignmentFormUpdateSchema.safeParse({ ...valid, prevStartDate: 'bad' });
		expect(r.success).toBe(false);
	});

	it('rejects when endDate < startDate', () => {
		const r = assignmentFormUpdateSchema.safeParse({
			...valid,
			startDate: '2026-05-10',
			endDate: '2026-05-09'
		});
		expect(r.success).toBe(false);
	});
});

describe('assignmentApiUpdateSchema', () => {
	const valid = {
		prevStartDate: '2026-05-01',
		resourceId: 'r1',
		projectId: 'p1',
		startDate: '2026-05-01',
		endDateExclusive: '2026-06-01'
	};

	it('accepts strict half-open interval (startDate < endDateExclusive)', () => {
		expect(assignmentApiUpdateSchema.safeParse(valid).success).toBe(true);
	});

	it('rejects startDate == endDateExclusive (would be empty interval)', () => {
		const r = assignmentApiUpdateSchema.safeParse({
			...valid,
			startDate: '2026-05-01',
			endDateExclusive: '2026-05-01'
		});
		expect(r.success).toBe(false);
		if (r.success) return;
		expect(r.error.issues[0].path).toEqual(['endDateExclusive']);
	});

	it('rejects startDate > endDateExclusive', () => {
		expect(
			assignmentApiUpdateSchema.safeParse({
				...valid,
				startDate: '2026-06-01',
				endDateExclusive: '2026-05-01'
			}).success
		).toBe(false);
	});

	it('rejects malformed dates', () => {
		expect(assignmentApiUpdateSchema.safeParse({ ...valid, startDate: 'yesterday' }).success).toBe(
			false
		);
	});
});
