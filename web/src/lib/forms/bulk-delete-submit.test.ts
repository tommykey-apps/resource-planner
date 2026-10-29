import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 一括削除の SubmitFunction (メンバー / 案件で共通)。
 * - 送信前に件数と関連アサイン数を確認ダイアログで示し、 キャンセルなら送らない
 * - 結果: 成功は件数のトースト、 一部失敗は失敗件数のトースト (1 件ごとに削除するので成功分は消えている)
 * - どちらでも選択を解除して一覧を読み直す
 */
const confirmDialog = vi.hoisted(() => vi.fn());
vi.mock('./confirm-dialog', () => ({ confirmDialog }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('svelte-sonner', () => ({ toast }));

import { makeBulkDeleteSubmit } from './bulk-delete-submit';

const messages = {
	confirm: (count: number) => `confirm ${count}`,
	confirmWithAssignments: (count: number, assignments: number) =>
		`confirm ${count} + ${assignments}`,
	deleted: (count: number) => `deleted ${count}`
};

type SubmitArgs = Parameters<ReturnType<typeof makeBulkDeleteSubmit>>[0];

function submit(fn: ReturnType<typeof makeBulkDeleteSubmit>) {
	const cancel = vi.fn();
	return { cancel, run: () => fn({ cancel } as unknown as SubmitArgs) };
}

beforeEach(() => {
	confirmDialog.mockReset();
	toast.success.mockReset();
	toast.error.mockReset();
});

describe('makeBulkDeleteSubmit', () => {
	it('関連アサインがあれば件数付きで確認し、 キャンセルなら送らない', async () => {
		confirmDialog.mockResolvedValue(false);
		const fn = makeBulkDeleteSubmit({
			getIds: () => ['a', 'b'],
			assignmentCountOf: (id) => (id === 'a' ? 3 : 0),
			messages,
			onDone: vi.fn()
		});
		const { cancel, run } = submit(fn);
		expect(await run()).toBeUndefined();
		expect(confirmDialog).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'confirm 2 + 3', destructive: true })
		);
		expect(cancel).toHaveBeenCalled();
	});

	it('成功なら削除件数をトーストし、 選択を解除して読み直す', async () => {
		confirmDialog.mockResolvedValue(true);
		const onDone = vi.fn();
		const fn = makeBulkDeleteSubmit({
			getIds: () => ['a'],
			assignmentCountOf: () => 0,
			messages,
			onDone
		});
		const after = await submit(fn).run();
		const update = vi.fn();
		await after!({
			result: { type: 'success', status: 200, data: { deleted: ['a'] } },
			update
		} as never);
		expect(toast.success).toHaveBeenCalledWith('deleted 1');
		expect(onDone).toHaveBeenCalled();
		expect(update).toHaveBeenCalled();
	});

	it('一部失敗なら失敗件数をトーストする', async () => {
		confirmDialog.mockResolvedValue(true);
		const fn = makeBulkDeleteSubmit({
			getIds: () => ['a', 'b'],
			assignmentCountOf: () => 0,
			messages,
			onDone: vi.fn()
		});
		const after = await submit(fn).run();
		await after!({
			result: { type: 'failure', status: 500, data: { deleted: ['a'], failed: ['b'] } },
			update: vi.fn()
		} as never);
		expect(toast.error).toHaveBeenCalledWith(
			'1 件を削除できませんでした。再読み込みして確認してください'
		);
	});
});
