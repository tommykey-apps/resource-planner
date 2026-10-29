import { describe, expect, it, vi } from 'vitest';
import { deleteEach } from './bulk';

describe('deleteEach', () => {
	it('順に削除し、 失敗しても残りを続けて成功 / 失敗の id を返す', async () => {
		const deleteOne = vi.fn(async (id: string) => {
			if (id === 'b') throw new Error('boom');
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await deleteEach(['a', 'b', 'c'], deleteOne)).toEqual({
			deleted: ['a', 'c'],
			failed: ['b']
		});
		expect(deleteOne.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
	});
});
