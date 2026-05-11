import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { confirmDialog, confirmRequest, resolveConfirm } from './confirm-dialog';

/**
 * #132: confirmDialog imperative API の挙動。
 * - request を store に push
 * - resolveConfirm(true) で promise が true で resolve
 * - resolveConfirm(false) で false で resolve、store を clear
 */
describe('confirmDialog (#132)', () => {
	it('pushes a request to the store', () => {
		const promise = confirmDialog({ title: 'Confirm', message: 'really?' });
		const req = get(confirmRequest);
		expect(req).not.toBeNull();
		expect(req?.title).toBe('Confirm');
		expect(req?.message).toBe('really?');
		// resolve to clean up
		resolveConfirm(false);
		return promise.then((ok) => expect(ok).toBe(false));
	});

	it('resolves with true when resolveConfirm(true) is called', async () => {
		const p = confirmDialog({ title: 'T', message: 'M' });
		resolveConfirm(true);
		expect(await p).toBe(true);
	});

	it('clears the store after resolve', () => {
		confirmDialog({ title: 'T', message: 'M' });
		resolveConfirm(false);
		expect(get(confirmRequest)).toBeNull();
	});

	it('preserves optional fields confirmLabel / cancelLabel / destructive', () => {
		confirmDialog({
			title: 'T',
			message: 'M',
			confirmLabel: 'Delete',
			cancelLabel: 'Keep',
			destructive: true
		});
		const req = get(confirmRequest);
		expect(req?.confirmLabel).toBe('Delete');
		expect(req?.cancelLabel).toBe('Keep');
		expect(req?.destructive).toBe(true);
		resolveConfirm(false);
	});
});
