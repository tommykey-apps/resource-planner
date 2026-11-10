import { describe, expect, it } from 'vitest';
import { rollbackRecoverState } from './optimistic-rollback';

/**
 * #140: optimistic create が失敗したとき、 form 入力を捨てない契約。
 *
 * - temp.name を formName に復元 (#121 で破棄されていた挙動の修正)
 * - server からの該当 field error があれば translate、 無ければ fallback ('errors.generic')
 */
describe('rollbackRecoverState (#140)', () => {
	const translate = (e: { code: string; field: string; max?: number }) =>
		`translated:${e.code}:${e.field}${e.max !== undefined ? `:${e.max}` : ''}`;
	const fallback = 'Input error';

	it('temp.name を formName に復元', () => {
		const r = rollbackRecoverState({
			temp: { id: 't1', name: 'Bob' },
			failureData: undefined,
			translate,
			fallback,
			field: 'name'
		});
		expect(r.formName).toBe('Bob');
	});

	it('temp.name が undefined のとき formName は空文字 (defensive)', () => {
		const r = rollbackRecoverState({
			temp: { id: 't1' } as { id: string; name?: string },
			failureData: undefined,
			translate,
			fallback,
			field: 'name'
		});
		expect(r.formName).toBe('');
	});

	it('server から該当 field error が来ていれば translate', () => {
		const r = rollbackRecoverState({
			temp: { id: 't1', name: 'Bob' },
			failureData: {
				errors: { name: { code: 'tooLong', field: 'name', max: 100 } }
			},
			translate,
			fallback,
			field: 'name'
		});
		expect(r.formError).toBe('translated:tooLong:name:100');
	});

	it('failureData が undefined (network error / 500) → fallback', () => {
		const r = rollbackRecoverState({
			temp: { id: 't1', name: 'Bob' },
			failureData: undefined,
			translate,
			fallback,
			field: 'name'
		});
		expect(r.formError).toBe(fallback);
	});

	it('failureData.errors に対象 field なし → fallback', () => {
		const r = rollbackRecoverState({
			temp: { id: 't1', name: 'Bob' },
			failureData: {
				errors: { other: { code: 'required', field: 'other' } }
			},
			translate,
			fallback,
			field: 'name'
		});
		expect(r.formError).toBe(fallback);
	});

	it('field 引数の差し替え可能性 (将来の Project name / color 適用)', () => {
		const r = rollbackRecoverState({
			temp: { id: 't1', name: 'P1' },
			failureData: {
				errors: { color: { code: 'invalidColorFormat', field: 'color' } }
			},
			translate,
			fallback,
			field: 'color'
		});
		expect(r.formError).toBe('translated:invalidColorFormat:color');
	});
});
