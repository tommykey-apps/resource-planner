// @vitest-environment jsdom
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import ConfirmDialog from './ConfirmDialog.svelte';
import { confirmDialog, confirmRequest, resolveConfirm } from '$lib/forms/confirm-dialog';

/**
 * #132 で導入した imperative confirmDialog の UI 結合テスト。
 *
 * 既存の `confirm-dialog.test.ts` は store + Promise の単体 test しか無く、
 * `<ConfirmDialog />` を mount したときの DOM 挙動は assert されていない。
 * PR #148 で `<AlertDialog.Portal>` を削除した際に dialog 表示が壊れても
 * すり抜けた regression を防ぐため、 ここで UI 契約を固定する。
 */

afterEach(() => {
	// 直前 test が pending request を残してたら掃除
	if (get(confirmRequest)) resolveConfirm(false);
});

async function findAlertDialog(): Promise<HTMLElement> {
	// AlertDialog は body 直下に Portal される → testing-library の container には居ない
	// (jsdom 上の Portal target はデフォルトで body)
	return await waitFor(() => {
		const el = document.querySelector('[role="alertdialog"]');
		if (!el) throw new Error('alertdialog not yet in DOM');
		return el as HTMLElement;
	});
}

describe('<ConfirmDialog /> UI integration (#132)', () => {
	it('store に request が積まれたら DOM に role="alertdialog" が現れる', async () => {
		render(ConfirmDialog);
		expect(document.querySelector('[role="alertdialog"]')).toBeNull();

		const promise = confirmDialog({ title: 'Delete?', message: 'Bob を削除します' });
		const dialog = await findAlertDialog();
		expect(dialog.textContent).toContain('Delete?');
		expect(dialog.textContent).toContain('Bob を削除します');

		resolveConfirm(false);
		await promise;
	});

	it('Cancel ボタン押下で resolveConfirm(false) → promise が false、 dialog が消える', async () => {
		render(ConfirmDialog);
		const promise = confirmDialog({
			title: 'T',
			message: 'M',
			confirmLabel: 'やる',
			cancelLabel: 'やめる'
		});
		const dialog = await findAlertDialog();
		const cancel = Array.from(dialog.querySelectorAll('button')).find(
			(b) => b.textContent?.trim() === 'やめる'
		);
		expect(cancel).toBeTruthy();
		await fireEvent.click(cancel!);

		expect(await promise).toBe(false);
		await waitFor(() => expect(document.querySelector('[role="alertdialog"]')).toBeNull());
	});

	it('Action ボタン押下で resolveConfirm(true) → promise が true', async () => {
		render(ConfirmDialog);
		const promise = confirmDialog({
			title: 'T',
			message: 'M',
			confirmLabel: 'やる',
			cancelLabel: 'やめる'
		});
		const dialog = await findAlertDialog();
		const action = Array.from(dialog.querySelectorAll('button')).find(
			(b) => b.textContent?.trim() === 'やる'
		);
		expect(action).toBeTruthy();
		await fireEvent.click(action!);

		expect(await promise).toBe(true);
	});

	it('destructive: true で Action ボタンに destructive variant class が付く', async () => {
		render(ConfirmDialog);
		const promise = confirmDialog({
			title: 'T',
			message: 'M',
			confirmLabel: 'Delete',
			destructive: true
		});
		const dialog = await findAlertDialog();
		const action = Array.from(dialog.querySelectorAll('button')).find(
			(b) => b.textContent?.trim() === 'Delete'
		);
		// shadcn buttonVariants({ variant: 'destructive' }) は bg-destructive class を出力
		expect(action?.className).toMatch(/bg-destructive/);
		resolveConfirm(false);
		await promise;
	});

	it('同じ ConfirmDialog mount で 2 回 confirmDialog を連続呼び出ししても 2 回目も表示される', async () => {
		render(ConfirmDialog);

		const p1 = confirmDialog({ title: 'first', message: 'one' });
		const d1 = await findAlertDialog();
		expect(d1.textContent).toContain('first');
		resolveConfirm(true);
		expect(await p1).toBe(true);
		await waitFor(() => expect(document.querySelector('[role="alertdialog"]')).toBeNull());

		const p2 = confirmDialog({ title: 'second', message: 'two' });
		const d2 = await findAlertDialog();
		expect(d2.textContent).toContain('second');
		resolveConfirm(false);
		expect(await p2).toBe(false);
	});
});
