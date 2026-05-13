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

describe('projectCreateSchema — detail fields (#187)', () => {
	const base = { name: 'P1', color: '#abcdef' };

	it('defaults description to undefined, tags/links to [] when omitted', () => {
		const r = projectCreateSchema.safeParse(base);
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data).toEqual({
			name: 'P1',
			color: '#abcdef',
			description: undefined,
			tags: [],
			links: []
		});
	});

	it('normalizes empty/whitespace description to undefined', () => {
		const r = projectCreateSchema.safeParse({ ...base, description: '   ' });
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data.description).toBeUndefined();
	});

	it('accepts description up to 10,000 chars', () => {
		expect(
			projectCreateSchema.safeParse({ ...base, description: 'a'.repeat(10_000) }).success
		).toBe(true);
		expect(
			projectCreateSchema.safeParse({ ...base, description: 'a'.repeat(10_001) }).success
		).toBe(false);
	});

	it('parses tags CSV with trim + NFC normalize + dedup', () => {
		const r = projectCreateSchema.safeParse({ ...base, tags: ' TypeScript ,  AWS,TypeScript ,, ' });
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data.tags).toEqual(['TypeScript', 'AWS']);
	});

	it('rejects more than 20 tags (tooMany)', () => {
		const tags = Array.from({ length: 21 }, (_, i) => `t${i}`).join(',');
		expect(projectCreateSchema.safeParse({ ...base, tags }).success).toBe(false);
	});

	it('rejects a single tag longer than 30 chars (tooLong)', () => {
		expect(projectCreateSchema.safeParse({ ...base, tags: 'a'.repeat(31) }).success).toBe(false);
	});

	it('parses linksJson and rejects javascript: URL (invalidUrl)', () => {
		const ok = projectCreateSchema.safeParse({
			...base,
			linksJson: JSON.stringify([{ label: 'Wiki', url: 'https://example.com/wiki' }])
		});
		expect(ok.success).toBe(true);
		if (!ok.success) return;
		expect(ok.data.links).toEqual([{ label: 'Wiki', url: 'https://example.com/wiki' }]);

		const bad = projectCreateSchema.safeParse({
			...base,
			linksJson: JSON.stringify([{ url: 'javascript:alert(1)' }])
		});
		expect(bad.success).toBe(false);
	});

	it('rejects more than 10 links (tooMany)', () => {
		const links = Array.from({ length: 11 }, (_, i) => ({ url: `https://example.com/${i}` }));
		const r = projectCreateSchema.safeParse({ ...base, linksJson: JSON.stringify(links) });
		expect(r.success).toBe(false);
	});

	it('normalizes invalid linksJson string to [] (parse fallback then validation)', () => {
		const r = projectCreateSchema.safeParse({ ...base, linksJson: '{not json' });
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data.links).toEqual([]);
	});

	it('renames linksJson → links in output (transform)', () => {
		const r = projectCreateSchema.safeParse({
			...base,
			linksJson: JSON.stringify([{ url: 'https://example.com' }])
		});
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data).not.toHaveProperty('linksJson');
		expect(r.data.links).toBeDefined();
	});
});

describe('projectUpdateSchema — detail fields (#187)', () => {
	it('carries id alongside detail fields', () => {
		const r = projectUpdateSchema.safeParse({
			id: 'p1',
			name: 'P1',
			color: '#abcdef',
			description: 'desc',
			tags: 'a,b',
			linksJson: JSON.stringify([{ url: 'https://example.com' }])
		});
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data).toEqual({
			id: 'p1',
			name: 'P1',
			color: '#abcdef',
			description: 'desc',
			tags: ['a', 'b'],
			links: [{ label: undefined, url: 'https://example.com' }]
		});
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

/**
 * #139: schema 内 `message` は **i18n code** であること (UI で `t(`errors.${msg}`)` で翻訳)。
 * 日本語 hardcode を含まないことを正規表現で守る。
 */
describe('error message contract — i18n codes (#139)', () => {
	const ALLOWED_CODES = new Set([
		'required',
		'tooLong',
		'tooMany',
		'invalidDateFormat',
		'invalidColorFormat',
		'invalidUrl',
		'endBeforeStart'
	]);

	function collect(schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }, input: unknown): string[] {
		const r = schema.safeParse(input);
		if (r.success || !r.error) return [];
		return r.error.issues.map((i) => i.message);
	}

	it('resourceCreateSchema: empty name → "required"', () => {
		expect(collect(resourceCreateSchema, { name: '' })).toContain('required');
	});

	it('resourceCreateSchema: too long name → "tooLong"', () => {
		expect(collect(resourceCreateSchema, { name: 'a'.repeat(101) })).toContain('tooLong');
	});

	it('projectCreateSchema: bad color → "invalidColorFormat"', () => {
		expect(collect(projectCreateSchema, { name: 'P', color: 'red' })).toContain(
			'invalidColorFormat'
		);
	});

	it('assignmentCreateSchema: bad date → "invalidDateFormat"', () => {
		expect(
			collect(assignmentCreateSchema, {
				resourceId: 'r',
				projectId: 'p',
				startDate: '2026/05/01',
				endDate: '2026-05-02'
			})
		).toContain('invalidDateFormat');
	});

	it('assignmentCreateSchema: endDate < startDate → "endBeforeStart"', () => {
		expect(
			collect(assignmentCreateSchema, {
				resourceId: 'r',
				projectId: 'p',
				startDate: '2026-05-10',
				endDate: '2026-05-01'
			})
		).toContain('endBeforeStart');
	});

	it('projectCreateSchema: too many tags → "tooMany" (#187)', () => {
		const tags = Array.from({ length: 21 }, (_, i) => `t${i}`).join(',');
		expect(collect(projectCreateSchema, { name: 'P', color: '#abcdef', tags })).toContain('tooMany');
	});

	it('projectCreateSchema: bad link url → "invalidUrl" (#187)', () => {
		expect(
			collect(projectCreateSchema, {
				name: 'P',
				color: '#abcdef',
				linksJson: JSON.stringify([{ url: 'javascript:alert(1)' }])
			})
		).toContain('invalidUrl');
	});

	it('全 message は ALLOWED_CODES に含まれる (日本語 hardcode 検知)', () => {
		const samples = [
			collect(resourceCreateSchema, { name: '' }),
			collect(resourceCreateSchema, { name: 'a'.repeat(101) }),
			collect(projectCreateSchema, { name: '', color: 'red' }),
			collect(projectCreateSchema, {
				name: 'P',
				color: '#abcdef',
				description: 'a'.repeat(10_001)
			}),
			collect(projectCreateSchema, {
				name: 'P',
				color: '#abcdef',
				tags: Array.from({ length: 21 }, (_, i) => `t${i}`).join(',')
			}),
			collect(projectCreateSchema, {
				name: 'P',
				color: '#abcdef',
				linksJson: JSON.stringify([{ url: 'javascript:alert(1)' }])
			}),
			collect(assignmentCreateSchema, {
				resourceId: '',
				projectId: '',
				startDate: 'bad',
				endDate: 'bad'
			}),
			collect(assignmentCreateSchema, {
				resourceId: 'r',
				projectId: 'p',
				startDate: '2026-05-10',
				endDate: '2026-05-01'
			})
		].flat();
		for (const msg of samples) {
			expect(ALLOWED_CODES, `unexpected message: ${JSON.stringify(msg)}`).toContain(msg);
		}
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
