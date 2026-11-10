import { describe, expect, it } from 'vitest';
import { resourceCreateSchema, resourceUpdateSchema, resourcesMoveSchema } from './schema';
import { ERROR_CODES, collectMessages } from '$lib/shared/forms/error-code-contract';

const EMAIL = 'alice@example.com';

describe('resourceCreateSchema', () => {
	it('accepts a valid name and email', () => {
		expect(resourceCreateSchema.safeParse({ name: 'Alice', email: EMAIL }).success).toBe(true);
	});

	it('rejects empty name', () => {
		const r = resourceCreateSchema.safeParse({ name: '', email: EMAIL });
		expect(r.success).toBe(false);
	});

	it('rejects name longer than 100 chars', () => {
		const r = resourceCreateSchema.safeParse({ name: 'a'.repeat(101), email: EMAIL });
		expect(r.success).toBe(false);
	});

	it('accepts name of exactly 100 chars', () => {
		expect(resourceCreateSchema.safeParse({ name: 'a'.repeat(100), email: EMAIL }).success).toBe(
			true
		);
	});

	it('rejects missing email', () => {
		expect(resourceCreateSchema.safeParse({ name: 'Alice' }).success).toBe(false);
	});

	it('rejects empty and whitespace-only email', () => {
		expect(resourceCreateSchema.safeParse({ name: 'Alice', email: '' }).success).toBe(false);
		expect(resourceCreateSchema.safeParse({ name: 'Alice', email: '   ' }).success).toBe(false);
	});

	it('rejects malformed email', () => {
		expect(resourceCreateSchema.safeParse({ name: 'Alice', email: 'alice' }).success).toBe(false);
		expect(resourceCreateSchema.safeParse({ name: 'Alice', email: 'a@b@c.jp' }).success).toBe(
			false
		);
	});

	it('rejects email longer than 254 chars (RFC 5321 path limit)', () => {
		const email = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`; // 255 chars
		expect(resourceCreateSchema.safeParse({ name: 'Alice', email }).success).toBe(false);
	});

	it('accepts email of exactly 254 chars', () => {
		const email = `${'a'.repeat(64)}@${'b'.repeat(185)}.com`;
		expect(resourceCreateSchema.safeParse({ name: 'Alice', email }).success).toBe(true);
	});

	it('normalizes email like Auth.js does (trim + lowercase) so login can match it', () => {
		const r = resourceCreateSchema.safeParse({ name: 'Alice', email: '  Alice@Example.COM ' });
		expect(r.success && r.data.email).toBe('alice@example.com');
	});

	it('accepts the reserved .invalid TLD used for members who never sign in', () => {
		expect(
			resourceCreateSchema.safeParse({ name: 'BP', email: 'bp@example.invalid' }).success
		).toBe(true);
	});
});

describe('resourceUpdateSchema', () => {
	it('requires id in addition to name and email', () => {
		expect(resourceUpdateSchema.safeParse({ name: 'Alice', email: EMAIL }).success).toBe(false);
		expect(resourceUpdateSchema.safeParse({ id: 'r1', name: 'Alice', email: EMAIL }).success).toBe(
			true
		);
	});

	it('rejects empty id', () => {
		expect(resourceUpdateSchema.safeParse({ id: '', name: 'Alice', email: EMAIL }).success).toBe(
			false
		);
	});

	it('requires email', () => {
		expect(resourceUpdateSchema.safeParse({ id: 'r1', name: 'Alice' }).success).toBe(false);
	});
});

/**
 * #139: schema 内 `message` は **i18n code** であること (UI で `t(`errors.${msg}`)` で翻訳)。
 * 日本語 hardcode を含まないことを正規表現で守る。
 */
describe('error message contract — i18n codes (#139)', () => {
	it('resourceCreateSchema: empty name → "required"', () => {
		expect(collectMessages(resourceCreateSchema, { name: '', email: EMAIL })).toContain('required');
	});

	it('resourceCreateSchema: too long name → "tooLong"', () => {
		expect(
			collectMessages(resourceCreateSchema, { name: 'a'.repeat(101), email: EMAIL })
		).toContain('tooLong');
	});

	it('resourceCreateSchema: empty email → "required"', () => {
		expect(collectMessages(resourceCreateSchema, { name: 'A', email: '' })).toContain('required');
	});

	it('resourceCreateSchema: malformed email → "invalidEmail"', () => {
		expect(collectMessages(resourceCreateSchema, { name: 'A', email: 'alice' })).toContain(
			'invalidEmail'
		);
	});

	it('resourceCreateSchema: too long email → "tooLong"', () => {
		const email = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`;
		expect(collectMessages(resourceCreateSchema, { name: 'A', email })).toContain('tooLong');
	});

	it('全 message は ERROR_CODES に含まれる (日本語 hardcode 検知)', () => {
		const samples = [
			collectMessages(resourceCreateSchema, { name: '', email: '' }),
			collectMessages(resourceCreateSchema, { name: 'a'.repeat(101), email: 'alice' })
		].flat();
		for (const msg of samples) {
			expect(ERROR_CODES, `unexpected message: ${JSON.stringify(msg)}`).toContain(msg);
		}
	});
});

describe('resourcesMoveSchema', () => {
	it('部署の一括変更: 空の departmentId は未所属 (undefined)', () => {
		expect(resourcesMoveSchema.parse({ ids: ['a'], departmentId: '' })).toEqual({ ids: ['a'] });
		expect(resourcesMoveSchema.parse({ ids: ['a'], departmentId: 'd1' })).toEqual({
			ids: ['a'],
			departmentId: 'd1'
		});
	});
});
