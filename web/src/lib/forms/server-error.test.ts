import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formatZodErrors, translateServerError } from './server-error';
import { localeState } from '$lib/i18n/index.svelte';

/**
 * #139: server → client wire format の純粋関数を test。
 *
 * - formatZodErrors: zod issue → { code, field, max? } の mapping (i18n 済文字列を返さない契約)
 * - translateServerError: code を locale 済文字列に翻訳、 max を補間、 key 欠落で generic に fallback
 */

describe('formatZodErrors (#139)', () => {
	const schema = z.object({
		name: z.string().min(1, 'required').max(5, 'tooLong'),
		startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalidDateFormat')
	});

	it('required → { code: "required", field: "name" }', () => {
		const r = schema.safeParse({ name: '', startDate: '2026-05-01' });
		if (r.success) throw new Error('should fail');
		const errors = formatZodErrors(r);
		expect(errors.name).toEqual({ code: 'required', field: 'name' });
	});

	it('tooLong → max を保持して { code: "tooLong", field: "name", max: 5 }', () => {
		const r = schema.safeParse({ name: 'abcdef', startDate: '2026-05-01' });
		if (r.success) throw new Error('should fail');
		expect(formatZodErrors(r).name).toEqual({ code: 'tooLong', field: 'name', max: 5 });
	});

	it('複数 field の error を全て収集', () => {
		const r = schema.safeParse({ name: '', startDate: 'bad' });
		if (r.success) throw new Error('should fail');
		const errors = formatZodErrors(r);
		expect(errors.name?.code).toBe('required');
		expect(errors.startDate?.code).toBe('invalidDateFormat');
	});

	it('同 field の 2 つ目の issue は捨てる (UX: 1 field 1 error)', () => {
		// schema 自体に同 field 2 issue は出にくいので、 直接 mock。
		const issues = [
			{ code: 'too_small', path: ['name'], message: 'required' } as z.ZodIssue,
			{ code: 'too_big', path: ['name'], message: 'tooLong', maximum: 5 } as z.ZodIssue
		];
		const fakeResult = {
			success: false,
			error: { issues }
		} as unknown as z.ZodSafeParseError<unknown>;
		const errors = formatZodErrors(fakeResult);
		expect(errors.name?.code).toBe('required');
		expect(errors.name?.max).toBeUndefined();
	});
});

describe('translateServerError (#139)', () => {
	it('null / undefined → 空文字', () => {
		expect(translateServerError(null)).toBe('');
		expect(translateServerError(undefined)).toBe('');
	});

	it('ja locale: required → "{field} は必須です" に field 翻訳済を補間', () => {
		localeState.current = 'ja';
		expect(translateServerError({ code: 'required', field: 'name' })).toBe('名前 は必須です');
	});

	it('en locale: required → "{field} is required"', () => {
		localeState.current = 'en';
		expect(translateServerError({ code: 'required', field: 'startDate' })).toBe(
			'Start date is required'
		);
	});

	it('tooLong は max を補間', () => {
		localeState.current = 'en';
		expect(translateServerError({ code: 'tooLong', field: 'name', max: 100 })).toBe(
			'Name must be at most 100 characters'
		);
	});

	it('未知の code は errors.generic に fallback (locale に追随)', () => {
		localeState.current = 'ja';
		expect(translateServerError({ code: 'noSuchCode', field: 'name' })).toBe('入力エラー');
		localeState.current = 'en';
		expect(translateServerError({ code: 'noSuchCode', field: 'name' })).toBe('Input error');
	});
});
