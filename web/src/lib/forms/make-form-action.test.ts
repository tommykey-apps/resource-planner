import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type { RequestEvent } from '@sveltejs/kit';
import type { AppSession } from '$lib/session';

const requireSessionMock = vi.fn();

vi.mock('$lib/session', () => ({
	requireSession: (event: unknown) => requireSessionMock(event)
}));

import { makeFormAction } from './make-form-action';

/**
 * #171: +page.server.ts の 9 form action ボイラープレートを 1 helper に集約。
 * - requireSession → formData → safeParse → fail(400) or run → return
 * - delete 系の `typeof id !== 'string'` 手書きを zod schema 化で吸収
 * - 戻り値の `action` field と success / fail 形は既存挙動と互換
 */

const SESSION: AppSession = {
	userId: 'u1',
	email: 'alice@example.com',
	teamId: 'team_default'
};

function makeEvent(formEntries: Record<string, string>): RequestEvent {
	const fd = new FormData();
	for (const [k, v] of Object.entries(formEntries)) fd.append(k, v);
	return {
		request: { formData: async () => fd }
	} as unknown as RequestEvent;
}

beforeEach(() => {
	requireSessionMock.mockReset().mockResolvedValue(SESSION);
});

describe('makeFormAction (#171)', () => {
	const schema = z.object({ name: z.string().min(1, 'required') });

	it('success path: schema parse → run called with (session, parsed) → returns { action, success: true }', async () => {
		const run = vi.fn().mockResolvedValue(undefined);
		const action = makeFormAction({ action: 'createResource', schema, run });

		const result = await action(makeEvent({ name: 'alice' }));

		expect(run).toHaveBeenCalledWith(SESSION, { name: 'alice' });
		expect(result).toEqual({ action: 'createResource', success: true });
	});

	it('returns extra fields from run() result merged into success payload', async () => {
		const resource = { id: 'r1', name: 'alice' };
		const run = vi.fn().mockResolvedValue({ resource });
		const action = makeFormAction({ action: 'createResource', schema, run });

		const result = await action(makeEvent({ name: 'alice' }));

		expect(result).toEqual({ action: 'createResource', success: true, resource });
	});

	it('schema fail: returns fail(400) with formatted ServerErrors + action field', async () => {
		const run = vi.fn();
		const action = makeFormAction({ action: 'createResource', schema, run });

		const result = (await action(makeEvent({ name: '' }))) as {
			status: number;
			data: { action: string; errors: Record<string, { code: string; field: string }> };
		};

		expect(result.status).toBe(400);
		expect(result.data.action).toBe('createResource');
		expect(result.data.errors.name).toEqual({ code: 'required', field: 'name' });
		expect(run).not.toHaveBeenCalled();
	});

	it('requireSession failure: propagates (throws), no run / no fail', async () => {
		requireSessionMock.mockRejectedValueOnce(new Error('unauthorized'));
		const run = vi.fn();
		const action = makeFormAction({ action: 'updateResource', schema, run });

		await expect(action(makeEvent({ name: 'alice' }))).rejects.toThrow('unauthorized');
		expect(run).not.toHaveBeenCalled();
	});

	it('delete-style schema (id only) emits required error for empty id (form-submitted with empty hidden input)', async () => {
		// 実機: <input type="hidden" name="id" value={r.id} /> で submit するため id field は
		// 常に formData に存在する。 値が空文字のときに 'required' code を出すかを検証。
		const deleteSchema = z.object({ id: z.string().min(1, 'required') });
		const run = vi.fn();
		const action = makeFormAction({ action: 'deleteResource', schema: deleteSchema, run });

		const result = (await action(makeEvent({ id: '' }))) as {
			status: number;
			data: { errors: Record<string, { code: string; field: string }> };
		};

		expect(result.status).toBe(400);
		expect(result.data.errors.id?.code).toBe('required');
	});
});

/**
 * 一括操作: ids のように同じ key を繰り返す form は Object.fromEntries だと最後の値しか残らない。
 * readInput で formData の読み方を差し替えられるようにする。
 * また run が fail() を返したら (一括削除の一部失敗など) そのまま返す。
 */
describe('makeFormAction: readInput / run からの fail', () => {
	it('readInput で読んだ値を schema に渡す', async () => {
		const run = vi.fn().mockResolvedValue(undefined);
		const action = makeFormAction({
			action: 'deleteResources',
			schema: z.object({ ids: z.array(z.string()) }),
			readInput: (fd) => ({ ids: fd.getAll('ids') }),
			run
		});
		const fd = new FormData();
		fd.append('ids', 'a');
		fd.append('ids', 'b');
		await action({ request: { formData: async () => fd } } as unknown as RequestEvent);
		expect(run).toHaveBeenCalledWith(SESSION, { ids: ['a', 'b'] });
	});

	it('run が fail() を返したらそのまま返す', async () => {
		const { fail } = await import('@sveltejs/kit');
		const action = makeFormAction({
			action: 'deleteResources',
			schema: z.object({ name: z.string() }),
			run: async () => fail(500, { failed: ['x'] })
		});
		const result = (await action(makeEvent({ name: 'a' }))) as {
			status: number;
			data: { failed: string[] };
		};
		expect(result.status).toBe(500);
		expect(result.data).toEqual({ failed: ['x'] });
	});
});
