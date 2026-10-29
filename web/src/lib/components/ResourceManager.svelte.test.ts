// @vitest-environment jsdom
import { fireEvent, render, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResourceManager from './ResourceManager.svelte';
import { PAGE_SIZE } from '$lib/list-table';
import type { Assignment, Department, Resource } from '$lib/types';

// 一覧の絞り込み・並び替え・ページは URL query に持つので $app/state と $app/navigation を mock する。
const pageState = vi.hoisted(() => ({ url: new URL('http://localhost/resources') }));
vi.mock('$app/state', () => ({ page: pageState }));
const goto = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto }));
vi.stubGlobal(
	'ResizeObserver',
	class {
		observe() {}
		disconnect() {}
	}
);

function setQuery(query: string) {
	pageState.url = new URL(`http://localhost/resources${query}`);
}

beforeEach(() => {
	goto.mockClear();
	setQuery('');
});

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
		expect(getByRole('button', { name: /メンバーを追加/ })).toBeInTheDocument();
		expect(getByText('Alice')).toBeInTheDocument();
		expect(getByText('Bob')).toBeInTheDocument();
	});

	it('起動用の「メンバーを管理」 button を持たない', () => {
		const { queryByRole } = render(ResourceManager, { props: { resources: [], assignments: [] } });
		expect(queryByRole('button', { name: /メンバーを管理/ })).toBeNull();
	});

	it('0 件のときは空状態の文言を出す', () => {
		const { getByText } = render(ResourceManager, { props: { resources: [], assignments: [] } });
		expect(getByText('メンバーはいません。')).toBeInTheDocument();
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
		expect(result.getByRole('button', { name: /メンバーを追加/ })).toBeInTheDocument();
	});
});

/**
 * 一覧を表にする (DESIGN.md「一覧は表。 並び替え・絞り込み・件数・ページ送り」)。
 * - 1行1メンバー。 部署はグループ見出しではなく列にする (デジタル庁「テーブル」: グループ行を挟まない)
 * - 名前は行見出し (th scope=row)
 */
const DEPTS: Department[] = [
	{ id: 'd1', name: '開発本部', parentId: null },
	{ id: 'd2', name: 'バックエンド課', parentId: 'd1' },
	{ id: 'd3', name: '営業部', parentId: null }
];
const RESOURCES: Resource[] = [
	{ id: 'r1', name: '鈴木', departmentId: 'd2' },
	{ id: 'r2', name: '佐藤', departmentId: 'd3' },
	{ id: 'r3', name: '高橋' }
];
const asn = (id: string, resourceId: string): Assignment => ({
	id,
	resourceId,
	projectId: 'p1',
	startDate: '2026-01-01',
	endDateExclusive: '2026-01-02',
	version: 1
});
const ASSIGNMENTS = [asn('a1', 'r2'), asn('a2', 'r2'), asn('a3', 'r1')];

function renderTable(resources = RESOURCES) {
	return render(ResourceManager, {
		props: { resources, assignments: ASSIGNMENTS, departments: DEPTS }
	});
}

function rowNames(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll('tbody th[scope="row"]')).map(
		(th) => th.textContent?.trim() ?? ''
	);
}

describe('ResourceManager の表', () => {
	it('列は 名前 / 部署 / アサイン数 / 操作。 名前は行見出し', () => {
		const { getAllByRole, container } = renderTable();
		const headers = getAllByRole('columnheader');
		// 先頭は行選択 (全選択のチェックボックス) の列
		expect(headers[0].querySelector('input[type="checkbox"]')).not.toBeNull();
		expect(headers.slice(1).map((h) => h.textContent?.trim())).toEqual([
			'名前',
			'部署',
			'アサイン数',
			'操作'
		]);
		expect(rowNames(container)).toHaveLength(3);
	});

	it('部署は列に出し、 未所属は「未所属」', () => {
		const { getByRole } = renderTable();
		const row = getByRole('row', { name: /高橋/ });
		expect(within(row).getByText('未所属')).toBeInTheDocument();
		expect(
			within(getByRole('row', { name: /鈴木/ })).getByText('バックエンド課')
		).toBeInTheDocument();
	});

	it('既定は名前の昇順で、 名前の列に aria-sort=ascending', () => {
		const { getByRole } = renderTable();
		expect(getByRole('columnheader', { name: /名前/ }).getAttribute('aria-sort')).toBe('ascending');
		expect(getByRole('columnheader', { name: /アサイン数/ }).hasAttribute('aria-sort')).toBe(false);
	});

	it('?sort=assignments&dir=desc でアサイン数の多い順', () => {
		setQuery('?sort=assignments&dir=desc');
		const { container } = renderTable();
		expect(rowNames(container)).toEqual(['佐藤', '鈴木', '高橋']);
	});

	it('列見出しを押すと URL の sort / dir を書き換える', async () => {
		const { getByRole } = renderTable();
		await fireEvent.click(getByRole('button', { name: 'アサイン数' }));
		expect(goto).toHaveBeenCalledWith('/resources?sort=assignments', expect.anything());
	});

	it('?q= で名前を部分一致で絞り込み、 件数を出す', () => {
		setQuery('?q=佐');
		const { container, getByText } = renderTable();
		expect(rowNames(container)).toEqual(['佐藤']);
		expect(getByText('1 件')).toBeInTheDocument();
	});

	// 選択肢の文字が名前に混ざらないよう、 label は for/id で関連付ける。
	it('絞り込みの入力欄と部署の選択は、 見出しの文字だけを名前に持つ', () => {
		const { getByRole } = renderTable();
		expect(getByRole('searchbox', { name: '名前で絞り込み' })).toBeInTheDocument();
		expect(getByRole('combobox', { name: '部署' })).toBeInTheDocument();
	});

	it('?dept= は子孫の部署も含めて絞り込む', () => {
		setQuery('?dept=d1');
		const { container } = renderTable();
		expect(rowNames(container)).toEqual(['鈴木']);
	});

	it('名前の入力で URL の q を書き換え、 1 ページ目に戻す', async () => {
		setQuery('?page=2');
		const { getByLabelText } = renderTable();
		await fireEvent.input(getByLabelText('名前で絞り込み'), { target: { value: '佐' } });
		expect(goto).toHaveBeenCalledWith('/resources?q=%E4%BD%90', expect.anything());
	});

	it('一致しなければ専用の文言と「絞り込みを解除」を出す', async () => {
		setQuery('?q=存在しない');
		const { getByText, getByRole, queryByRole } = renderTable();
		expect(getByText('条件に一致するメンバーはいません')).toBeInTheDocument();
		expect(queryByRole('table')).toBeNull();
		await fireEvent.click(getByRole('button', { name: '絞り込みを解除' }));
		expect(goto).toHaveBeenCalledWith('/resources', expect.anything());
	});

	it(`${PAGE_SIZE} 件を超えるとページ送りを出し、 ?page=2 で続きを出す`, () => {
		const many = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({
			id: `m${i}`,
			name: `member${String(i).padStart(3, '0')}`
		}));
		const first = render(ResourceManager, { props: { resources: many, assignments: [] } });
		expect(rowNames(first.container)).toHaveLength(PAGE_SIZE);
		expect(first.getByRole('link', { name: '次のページ' }).getAttribute('href')).toBe(
			'/resources?page=2'
		);
		first.unmount();
		setQuery('?page=2');
		const second = render(ResourceManager, { props: { resources: many, assignments: [] } });
		expect(rowNames(second.container)).toEqual([`member${String(PAGE_SIZE).padStart(3, '0')}`]);
	});

	it('横スクロールの領域は表の名前を持ち、 キーボードで focus できる', () => {
		const { getByRole } = renderTable();
		const region = getByRole('region', { name: 'メンバー' });
		expect(region.getAttribute('tabindex')).toBe('0');
	});
});

/**
 * 一括操作 (デジタル庁「テーブル」行の選択 + Carbon Data table batch actions)。
 * 選んだ行の id を hidden で送る。 全選択の対象は表示中のページだけ。
 */
describe('ResourceManager の一括操作', () => {
	function hiddenIds(form: Element | null): string[] {
		return Array.from(form?.querySelectorAll('input[name="ids"]') ?? []).map(
			(i) => (i as HTMLInputElement).value
		);
	}

	it('行を選ぶと一括操作バーが出て、 削除と部署変更の form に id が入る', async () => {
		const { getByRole, queryByRole, container } = renderTable();
		expect(queryByRole('region', { name: '一括操作' })).toBeNull();
		await fireEvent.click(getByRole('checkbox', { name: '佐藤' }));
		const bar = getByRole('region', { name: '一括操作' });
		expect(within(bar).getByText('1 件を選択中')).toBeInTheDocument();
		expect(hiddenIds(container.querySelector('form[action="/?/deleteResources"]'))).toEqual(['r2']);
		const move = container.querySelector('form[action="/?/moveResources"]');
		expect(hiddenIds(move)).toEqual(['r2']);
		expect(within(bar).getByRole('combobox', { name: '所属部署を変更' })).toBeInTheDocument();
	});

	it('全選択は表示中の行だけを選ぶ (絞り込みで隠れた行は含めない)', async () => {
		setQuery('?q=佐');
		const { getByRole, container } = renderTable();
		await fireEvent.click(getByRole('checkbox', { name: '行を選択' }));
		expect(hiddenIds(container.querySelector('form[action="/?/deleteResources"]'))).toEqual(['r2']);
	});

	it('一括操作中は行ごとの編集・削除を無効にする', async () => {
		const { getByRole } = renderTable();
		await fireEvent.click(getByRole('checkbox', { name: '佐藤' }));
		const row = getByRole('row', { name: /鈴木/ });
		for (const b of within(row).getAllByRole('button')) expect(b).toBeDisabled();
	});

	it('選択を解除でバーが消える', async () => {
		const { getByRole, queryByRole } = renderTable();
		await fireEvent.click(getByRole('checkbox', { name: '佐藤' }));
		await fireEvent.click(getByRole('button', { name: '選択を解除' }));
		expect(queryByRole('region', { name: '一括操作' })).toBeNull();
	});
});
