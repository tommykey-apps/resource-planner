import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formatZodErrors, mapServerErrors, translateServerError } from './server-error';
import type { ServerErrors } from './server-error';
import { overwriteGetLocale } from '$lib/paraglide/runtime';

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
		overwriteGetLocale(() => 'ja');
		expect(translateServerError({ code: 'required', field: 'name' })).toBe('名前 は必須です');
	});

	it('en locale: required → "{field} is required"', () => {
		overwriteGetLocale(() => 'en');
		expect(translateServerError({ code: 'required', field: 'startDate' })).toBe(
			'Start date is required'
		);
	});

	it('tooLong は max を補間', () => {
		overwriteGetLocale(() => 'en');
		expect(translateServerError({ code: 'tooLong', field: 'name', max: 100 })).toBe(
			'Name must be at most 100 characters'
		);
	});

	it('未知の code は errors.generic に fallback (locale に追随)', () => {
		overwriteGetLocale(() => 'ja');
		expect(translateServerError({ code: 'noSuchCode', field: 'name' })).toBe('入力エラー');
		overwriteGetLocale(() => 'en');
		expect(translateServerError({ code: 'noSuchCode', field: 'name' })).toBe('Input error');
	});
});

/**
 * #170: form action result.type === 'failure' の per-field translateServerError mapping を
 * 4 component で同じ pattern が重複していたのを 1 helper に集約。
 *
 * - 第二引数の field 名 list 分だけ entry を返す (errors に該当 field が無くても undefined)
 * - errors が undefined / null なら全 field が undefined の object を返す (UI 側の null check 省略)
 */
describe('mapServerErrors (#170)', () => {
	it('field list 分のキーを返し、 該当 field のみ翻訳結果が入る (他は undefined)', () => {
		overwriteGetLocale(() => 'en');
		const errors: ServerErrors = {
			name: { code: 'required', field: 'name' }
		};
		const r = mapServerErrors(errors, ['name', 'color']);
		expect(r).toEqual({
			name: 'Name is required',
			color: undefined
		});
	});

	it('errors が undefined なら全 field が undefined', () => {
		const r = mapServerErrors(undefined, ['name', 'color']);
		expect(r).toEqual({ name: undefined, color: undefined });
	});

	it('errors が空 object なら全 field が undefined', () => {
		const r = mapServerErrors({}, ['name', 'color']);
		expect(r).toEqual({ name: undefined, color: undefined });
	});

	it('全 field hit: 4 field を一括翻訳', () => {
		overwriteGetLocale(() => 'en');
		const errors: ServerErrors = {
			resourceId: { code: 'required', field: 'resourceId' },
			projectId: { code: 'required', field: 'projectId' },
			startDate: { code: 'invalidDateFormat', field: 'startDate' },
			endDate: { code: 'endBeforeStart', field: 'endDate' }
		};
		const r = mapServerErrors(errors, ['resourceId', 'projectId', 'startDate', 'endDate']);
		expect(r.resourceId).toBe('Person is required');
		expect(r.projectId).toBe('Project is required');
		expect(r.startDate).toMatch(/YYYY-MM-DD/);
		expect(r.endDate).toMatch(/start date/i);
	});

	it('field 名の typo 等で errors に存在しない key は無視 (型安全に undefined)', () => {
		const errors: ServerErrors = {
			name: { code: 'required', field: 'name' }
		};
		const r = mapServerErrors(errors, ['nonexistent']);
		expect(r.nonexistent).toBeUndefined();
	});
});
