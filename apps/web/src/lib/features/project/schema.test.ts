import { describe, expect, it } from 'vitest';
import { projectCreateSchema, projectUpdateSchema } from './schema';
import { ERROR_CODES, collectMessages } from '$lib/shared/forms/error-code-contract';

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

describe('project の部署 (ADR 0016)', () => {
	it('部署 id をそのまま通す', () => {
		const out = projectCreateSchema.parse({ name: 'P1', color: '#abcdef', departmentId: 'd1' });
		expect(out.departmentId).toBe('d1');
	});

	it('空文字と未指定は未所属 (undefined)', () => {
		expect(
			projectCreateSchema.parse({ name: 'P1', color: '#abcdef', departmentId: '' }).departmentId
		).toBeUndefined();
		expect(
			projectCreateSchema.parse({ name: 'P1', color: '#abcdef' }).departmentId
		).toBeUndefined();
	});

	it('更新でも部署を通す', () => {
		const out = projectUpdateSchema.parse({
			id: 'p1',
			name: 'P1',
			color: '#abcdef',
			departmentId: 'd1'
		});
		expect(out.departmentId).toBe('d1');
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

/**
 * #139: schema 内 `message` は **i18n code** であること (UI で `t(`errors.${msg}`)` で翻訳)。
 * 日本語 hardcode を含まないことを正規表現で守る。
 */
describe('error message contract — i18n codes (#139)', () => {
	it('projectCreateSchema: bad color → "invalidColorFormat"', () => {
		expect(collectMessages(projectCreateSchema, { name: 'P', color: 'red' })).toContain(
			'invalidColorFormat'
		);
	});

	it('projectCreateSchema: too many tags → "tooMany" (#187)', () => {
		const tags = Array.from({ length: 21 }, (_, i) => `t${i}`).join(',');
		expect(collectMessages(projectCreateSchema, { name: 'P', color: '#abcdef', tags })).toContain(
			'tooMany'
		);
	});

	it('projectCreateSchema: bad link url → "invalidUrl" (#187)', () => {
		expect(
			collectMessages(projectCreateSchema, {
				name: 'P',
				color: '#abcdef',
				linksJson: JSON.stringify([{ url: 'javascript:alert(1)' }])
			})
		).toContain('invalidUrl');
	});

	it('全 message は ERROR_CODES に含まれる (日本語 hardcode 検知)', () => {
		const samples = [
			collectMessages(projectCreateSchema, { name: '', color: 'red' }),
			collectMessages(projectCreateSchema, {
				name: 'P',
				color: '#abcdef',
				description: 'a'.repeat(10_001)
			}),
			collectMessages(projectCreateSchema, {
				name: 'P',
				color: '#abcdef',
				tags: Array.from({ length: 21 }, (_, i) => `t${i}`).join(',')
			}),
			collectMessages(projectCreateSchema, {
				name: 'P',
				color: '#abcdef',
				linksJson: JSON.stringify([{ url: 'javascript:alert(1)' }])
			})
		].flat();
		for (const msg of samples) {
			expect(ERROR_CODES, `unexpected message: ${JSON.stringify(msg)}`).toContain(msg);
		}
	});
});
