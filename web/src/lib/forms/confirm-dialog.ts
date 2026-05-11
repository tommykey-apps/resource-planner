/**
 * confirmDialog (#132)。
 *
 * window.confirm の OS-native ボタン (OK / Cancel) が app の i18n に乗らない問題を回避する。
 * 共有 store に request を積み、root に mount された `<ConfirmDialog />` が読んで AlertDialog を開く。
 *
 * Usage:
 * ```ts
 * import { confirmDialog } from '$lib/components/ConfirmDialog.svelte';
 * const ok = await confirmDialog({
 *   title: t('common.confirm'),
 *   message: t('resources.confirmDelete', { name }),
 *   confirmLabel: t('common.delete'),
 *   destructive: true
 * });
 * if (ok) await action();
 * ```
 */
import { writable, type Writable } from 'svelte/store';

export type ConfirmRequest = {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
};

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void };

export const confirmRequest: Writable<Pending | null> = writable(null);

export function confirmDialog(opts: ConfirmRequest): Promise<boolean> {
	return new Promise((resolve) => {
		confirmRequest.set({ ...opts, resolve });
	});
}

export function resolveConfirm(ok: boolean): void {
	confirmRequest.update((req) => {
		req?.resolve(ok);
		return null;
	});
}
