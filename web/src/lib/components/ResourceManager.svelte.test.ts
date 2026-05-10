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

	it('keeps the emoji icon visible while wrapping the text label in a sm:inline span (mobile responsive、#96)', () => {
		const { getByRole } = render(ResourceManager, {
			props: { resources: [], assignments: [] }
		});
		const trigger = getByRole('button', { name: /人を管理/ });
		expect(trigger.textContent).toMatch(/👥/);
		expect(trigger.querySelector('.hidden.sm\\:inline')?.textContent).toMatch(/人を管理/);
	});
});
