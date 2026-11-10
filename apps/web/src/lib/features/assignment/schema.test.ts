import { describe, expect, it } from 'vitest';
import {
	assignmentApiUpdateSchema,
	assignmentCreateSchema,
	assignmentFormUpdateSchema,
	assignmentUpdateSchema
} from './schema';
import { ERROR_CODES, collectMessages } from '$lib/shared/forms/error-code-contract';

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

describe('assignmentUpdateSchema (ADR 0012: expectedVersion)', () => {
	it('requires id + expectedVersion and applies the +1-day transform', () => {
		const r = assignmentUpdateSchema.safeParse({
			id: 'a1',
			expectedVersion: 3,
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-01',
			endDate: '2026-05-31'
		});
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data).toEqual({
			id: 'a1',
			expectedVersion: 3,
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-06-01'
		});
	});

	it('coerces expectedVersion from string (FormData hidden input)', () => {
		const r = assignmentUpdateSchema.safeParse({
			id: 'a1',
			expectedVersion: '5',
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-01',
			endDate: '2026-05-31'
		});
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data.expectedVersion).toBe(5);
	});

	it('rejects missing id', () => {
		expect(
			assignmentUpdateSchema.safeParse({
				expectedVersion: 1,
				resourceId: 'r1',
				projectId: 'p1',
				startDate: '2026-05-01',
				endDate: '2026-05-31'
			}).success
		).toBe(false);
	});
});

describe('assignmentFormUpdateSchema (#99 / ADR 0012)', () => {
	const valid = {
		id: 'a1',
		expectedVersion: '2',
		resourceId: 'r1',
		projectId: 'p1',
		startDate: '2026-05-03',
		endDate: '2026-05-09'
	};

	it('= assignmentUpdateSchema (prevStartDate 廃止): flat payload + +1-day transform', () => {
		const r = assignmentFormUpdateSchema.safeParse(valid);
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data).toEqual({
			id: 'a1',
			expectedVersion: 2,
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-03',
			endDateExclusive: '2026-05-10'
		});
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
		expectedVersion: 2,
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

/**
 * #139: schema 内 `message` は **i18n code** であること (UI で `t(`errors.${msg}`)` で翻訳)。
 * 日本語 hardcode を含まないことを正規表現で守る。
 */
describe('error message contract — i18n codes (#139)', () => {
	it('assignmentCreateSchema: bad date → "invalidDateFormat"', () => {
		expect(
			collectMessages(assignmentCreateSchema, {
				resourceId: 'r',
				projectId: 'p',
				startDate: '2026/05/01',
				endDate: '2026-05-02'
			})
		).toContain('invalidDateFormat');
	});

	it('assignmentCreateSchema: endDate < startDate → "endBeforeStart"', () => {
		expect(
			collectMessages(assignmentCreateSchema, {
				resourceId: 'r',
				projectId: 'p',
				startDate: '2026-05-10',
				endDate: '2026-05-01'
			})
		).toContain('endBeforeStart');
	});

	it('全 message は ERROR_CODES に含まれる (日本語 hardcode 検知)', () => {
		const samples = [
			collectMessages(assignmentCreateSchema, {
				resourceId: '',
				projectId: '',
				startDate: 'bad',
				endDate: 'bad'
			}),
			collectMessages(assignmentCreateSchema, {
				resourceId: 'r',
				projectId: 'p',
				startDate: '2026-05-10',
				endDate: '2026-05-01'
			})
		].flat();
		for (const msg of samples) {
			expect(ERROR_CODES, `unexpected message: ${JSON.stringify(msg)}`).toContain(msg);
		}
	});
});
