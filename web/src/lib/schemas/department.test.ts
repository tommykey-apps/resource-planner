import { describe, expect, it } from 'vitest';
import { departmentCreateSchema } from './department';

describe('departmentCreateSchema (ADR 0013)', () => {
	it('accepts name only (flat = root)', () => {
		const r = departmentCreateSchema.safeParse({ name: '開発本部' });
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data).toEqual({ name: '開発本部', parentId: undefined });
	});

	it('empty / missing name → "required"', () => {
		expect(departmentCreateSchema.safeParse({ name: '' }).success).toBe(false);
		const r = departmentCreateSchema.safeParse({ name: '' });
		if (!r.success) expect(r.error.issues[0].message).toBe('required');
	});

	it('too long name → "tooLong"', () => {
		const r = departmentCreateSchema.safeParse({ name: 'あ'.repeat(101) });
		expect(r.success).toBe(false);
		if (!r.success) expect(r.error.issues[0].message).toBe('tooLong');
	});

	it('empty-string parentId is normalized to undefined (root)', () => {
		const r = departmentCreateSchema.safeParse({ name: 'X', parentId: '' });
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data.parentId).toBeUndefined();
	});

	it('keeps a real parentId (子部署、 #240)', () => {
		const r = departmentCreateSchema.safeParse({ name: '課', parentId: 'd1' });
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.data.parentId).toBe('d1');
	});
});
