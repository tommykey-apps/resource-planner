import { describe, expect, it } from 'vitest';
import { BULK_MAX_IDS, bulkIdsSchema } from './schema-primitives';

/**
 * 一括操作 (表で選んだ行): ids は 1 件以上。 上限は DynamoDB TransactWriteItems の 100 項目
 * (部署の一括変更を 1 トランザクションで行うため)。
 */
describe('bulkIdsSchema', () => {
	it('ids を配列で受け取る', () => {
		expect(bulkIdsSchema.parse({ ids: ['a', 'b'] })).toEqual({ ids: ['a', 'b'] });
	});

	it('ids が空なら required', () => {
		const r = bulkIdsSchema.safeParse({ ids: [] });
		expect(r.success).toBe(false);
		expect(r.error?.issues[0].message).toBe('required');
	});

	it('ids が 100 件を超えたら tooMany', () => {
		const ids = Array.from({ length: BULK_MAX_IDS + 1 }, (_, i) => `r${i}`);
		const r = bulkIdsSchema.safeParse({ ids });
		expect(r.success).toBe(false);
		expect(r.error?.issues[0].message).toBe('tooMany');
		expect(BULK_MAX_IDS).toBe(100);
	});

	it('同じ id の重複は 1 件にまとめる', () => {
		expect(bulkIdsSchema.parse({ ids: ['a', 'a', 'b'] })).toEqual({ ids: ['a', 'b'] });
	});
});
