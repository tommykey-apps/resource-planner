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
 * header 標準化: 一覧はダイアログではなく `/resources` ページの本文に直接出す。
 * form action は `/` に集約されたままなので、 別ページから送れるよう `/?/...` の絶対パスにする。
 */
describe('ResourceManager (smoke)', () => {
	it('一覧と追加 button をダイアログを開かずに直接 render する', () => {
		const { getByRole, getByText } = render(ResourceManager, {
			props: {
				resources: [
					{ id: 'r1', name: 'Alice' },
					{ id: 'r2', name: 'Bob' }
				],
				assignments: []
			}
		});
		expect(getByRole('button', { name: /人を追加/ })).toBeInTheDocument();
		expect(getByText('Alice')).toBeInTheDocument();
		expect(getByText('Bob')).toBeInTheDocument();
	});

	it('起動用の「人を管理」 button を持たない', () => {
		const { queryByRole } = render(ResourceManager, { props: { resources: [], assignments: [] } });
		expect(queryByRole('button', { name: /人を管理/ })).toBeNull();
	});

	it('0 件のときは空状態の文言を出す', () => {
		const { getByText } = render(ResourceManager, { props: { resources: [], assignments: [] } });
		expect(getByText('まだ人が登録されていません。')).toBeInTheDocument();
	});

	it('削除 form は /?/deleteResource に送る (別ページからでも / の action に届く)', () => {
		const { container } = render(ResourceManager, {
			props: { resources: [{ id: 'r1', name: 'Alice' }], assignments: [] }
		});
		expect(container.querySelector('form[action="/?/deleteResource"]')).toBeTruthy();
	});

	/**
	 * #121: optimistic UI props を受け取り、create flow で callback を発火する。
	 * 詳細な DOM 駆動 test は use:enhance の SubmitFunction 内部実装 + bits-ui Dialog の
	 * portal 越しになり jsdom で安定再現しづらいため、callbacks の prop signature だけ assert する。
	 */
	it('accepts optimistic create callbacks as props (#121 contract)', () => {
		const onOptimisticCreate = (_temp: { id: string; name: string }) => {};
		const onConfirmCreate = (_temp: { id: string }, _real: { id: string; name: string }) => {};
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
		expect(result.getByRole('button', { name: /人を追加/ })).toBeInTheDocument();
	});
});
