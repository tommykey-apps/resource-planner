// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ResourceManager from './ResourceManager.svelte';

/**
 * ResourceManager の smoke test。
 *
 * 主要な submit-disable 挙動 (連打抑制) は `lib/forms/submit-state.svelte.test.ts` で
 * helper レベルで保証済 (#94)。本 test は render が壊れていないことだけ確認する。
 *
 * 詳細な component test (form 編集 / 削除 confirm 等) は #99 で拡充予定。
 */
describe('ResourceManager (smoke)', () => {
	it('renders the trigger button with the resource count', () => {
		const { getByRole } = render(ResourceManager, {
			props: { resources: [], assignments: [] }
		});
		expect(getByRole('button', { name: /人を管理/ })).toBeInTheDocument();
	});

	it('shows count of provided resources in the trigger label', () => {
		const { getByRole } = render(ResourceManager, {
			props: {
				resources: [
					{ id: 'r1', name: 'Alice' },
					{ id: 'r2', name: 'Bob' }
				],
				assignments: []
			}
		});
		expect(getByRole('button', { name: /\(2\)/ })).toBeInTheDocument();
	});

	it('keeps the icon visible (phosphor svg) while wrapping the text label in a sm:inline span (mobile responsive、#96 / #105)', () => {
		const { getByRole } = render(ResourceManager, {
			props: { resources: [], assignments: [] }
		});
		const trigger = getByRole('button', { name: /人を管理/ });
		// 絵文字ではなく phosphor icon (svg + aria-hidden) を使用 (#105)
		const icon = trigger.querySelector('svg[aria-hidden="true"]');
		expect(icon).toBeTruthy();
		// 絵文字 👥 は使わない
		expect(trigger.textContent).not.toMatch(/👥/);
		expect(trigger.querySelector('.hidden.sm\\:inline')?.textContent).toMatch(/人を管理/);
	});

	/**
	 * #121: optimistic UI props を受け取り、create flow で callback を発火する。
	 * 詳細な DOM 駆動 test は use:enhance の SubmitFunction 内部実装 + bits-ui Dialog の
	 * portal 越しになり jsdom で安定再現しづらいため、callbacks の prop signature だけ assert する。
	 */
	it('accepts optimistic create callbacks as props (#121 contract)', () => {
		const onOptimisticCreate = (_temp: { id: string; name: string }) => {};
		const onConfirmCreate = (
			_temp: { id: string },
			_real: { id: string; name: string }
		) => {};
		const onRollbackCreate = (_temp: { id: string }) => {};
		const result = render(ResourceManager, {
			props: {
				resources: [],
				assignments: [],
				onOptimisticCreate,
				onConfirmCreate,
				onRollbackCreate
			}
		});
		// レンダリングが壊れないことを確認 (callback は実行されない)
		expect(result.getByRole('button', { name: /人を管理/ })).toBeInTheDocument();
	});
});
