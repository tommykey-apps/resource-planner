/**
 * 一括削除の SubmitFunction (メンバー / 案件で共通)。
 *
 * - 送信前に件数と関連アサイン数を確認ダイアログで示す (UC-06: 関連アサインも消える)
 * - server は 1 件ごとに原子的に削除する (repository/bulk.ts)。 一部失敗は fail(500) で
 *   `{ deleted, failed }` が返るので、 失敗件数を伝えて再読み込みを促す
 * - 結果によらず選択を解除し、 `update()` で一覧を読み直す
 */
import { toast } from 'svelte-sonner';
import type { SubmitFunction } from '@sveltejs/kit';
import { t } from '$lib/i18n/index.svelte';
import { confirmDialog } from './confirm-dialog';

export function makeBulkDeleteSubmit(opts: {
	getIds: () => string[];
	assignmentCountOf: (id: string) => number;
	messages: {
		confirm: (count: number) => string;
		confirmWithAssignments: (count: number, assignments: number) => string;
		deleted: (count: number) => string;
	};
	onDone: () => void;
}): SubmitFunction {
	return async ({ cancel }) => {
		const ids = opts.getIds();
		const assignments = ids.reduce((n, id) => n + opts.assignmentCountOf(id), 0);
		const ok = await confirmDialog({
			title: t('common.confirm'),
			message:
				assignments > 0
					? opts.messages.confirmWithAssignments(ids.length, assignments)
					: opts.messages.confirm(ids.length),
			confirmLabel: t('common.delete'),
			destructive: true
		});
		if (!ok) {
			cancel();
			return;
		}
		return async ({ result, update }) => {
			if (result.type === 'success') {
				const deleted = (result.data as { deleted?: string[] } | undefined)?.deleted ?? [];
				toast.success(opts.messages.deleted(deleted.length));
			} else if (result.type === 'failure') {
				const failed = (result.data as { failed?: string[] } | undefined)?.failed ?? [];
				toast.error(t('common.bulkDeleteFailed', { count: failed.length }));
			}
			opts.onDone();
			await update();
		};
	};
}
