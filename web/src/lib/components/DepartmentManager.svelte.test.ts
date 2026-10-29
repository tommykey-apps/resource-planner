// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import DepartmentManager from './DepartmentManager.svelte';
import type { Department, Resource } from '$lib/types';

vi.stubGlobal(
	'ResizeObserver',
	class {
		observe() {}
		disconnect() {}
	}
);

/**
 * #238 walking skeleton (ADR 0013): 部署の作成 + ツリー一覧。
 * header 標準化: 一覧はダイアログではなく `/departments` ページの本文に直接出す
 * (作成 action の挙動は page.server.test がカバー)。
 */
const DEPARTMENTS: Department[] = [
	{ id: 'd1', name: '開発本部', parentId: null },
	{ id: 'd2', name: 'バックエンド課', parentId: 'd1' }
];

describe('DepartmentManager (#238)', () => {
	it('ツリー一覧と追加 button をダイアログを開かずに直接 render する', () => {
		const { getByRole, getByText } = render(DepartmentManager, {
			props: { departments: DEPARTMENTS }
		});
		expect(getByRole('button', { name: /^\+ 部署を追加$/ })).toBeInTheDocument();
		expect(getByText('開発本部', { selector: 'th > span' })).toBeInTheDocument();
		expect(getByText('バックエンド課', { selector: 'th > span' })).toBeInTheDocument();
	});

	it('起動用の「部署を管理」 button を持たない', () => {
		const { queryByRole } = render(DepartmentManager, { props: { departments: [] } });
		expect(queryByRole('button', { name: /部署を管理/ })).toBeNull();
	});

	it('0 件のときは空状態の文言を出す', () => {
		const { getByText } = render(DepartmentManager, { props: { departments: [] } });
		expect(getByText('部署はありません。')).toBeInTheDocument();
	});
});

describe('DepartmentManager rename (#250)', () => {
	async function openEditFor(name: string) {
		render(DepartmentManager, { props: { departments: DEPARTMENTS } });
		const row = (await screen.findByText(name, { selector: 'th > span' })).closest('tr')!;
		const edit = Array.from(row.querySelectorAll('button')).find((b) =>
			/編集|Edit/.test(b.textContent ?? '')
		)!;
		await fireEvent.click(edit);
	}

	it('各行の「編集」で名前変更フォームを開く (現在名を初期値、 id を hidden で送る)', async () => {
		await openEditFor('バックエンド課');
		const input = (await screen.findByDisplayValue('バックエンド課')) as HTMLInputElement;
		const form = input.closest('form')!;
		expect(form.getAttribute('action')).toBe('/?/renameDepartment');
		expect((form.querySelector('input[name="id"]') as HTMLInputElement).value).toBe('d2');
	});

	it('編集モードでは親部署の選択を出さない (付け替えは行内 select が担う)', async () => {
		await openEditFor('バックエンド課');
		const input = await screen.findByDisplayValue('バックエンド課');
		expect(input.closest('form')!.querySelector('select[name="parentId"]')).toBeNull();
	});
});

/**
 * 部署の一覧も表にする。 ただしツリーなので並び替えとページ送りは付けない
 * (並べ替えや途中での分割で親子の並びが壊れるため)。
 * 階層はデジタル庁「テーブル」の字下げ行 (IndentedRows) に倣い、 字下げと
 * 視覚的に隠した親部署名で支援技術にも親子関係を伝える。
 */
describe('DepartmentManager の表', () => {
	const RESOURCES: Resource[] = [
		{ id: 'r1', name: '鈴木', departmentId: 'd2' },
		{ id: 'r2', name: '佐藤', departmentId: 'd2' },
		{ id: 'r3', name: '高橋', departmentId: 'd1' }
	];
	const renderTable = () =>
		render(DepartmentManager, { props: { departments: DEPARTMENTS, resources: RESOURCES } });

	it('列は 部署名 / 所属メンバー / 操作。 部署名は行見出しでツリー順', () => {
		const { getAllByRole, container } = renderTable();
		expect(getAllByRole('columnheader').map((h) => h.textContent?.trim())).toEqual([
			'部署名',
			'所属メンバー',
			'操作'
		]);
		const names = Array.from(
			container.querySelectorAll('tbody th[scope="row"] > span:last-child')
		).map((s) => s.textContent);
		expect(names).toEqual(['開発本部', 'バックエンド課']);
	});

	it('子部署の行見出しは親部署名を視覚的に隠して含む', () => {
		const { getByRole } = renderTable();
		const child = getByRole('rowheader', { name: /バックエンド課/ });
		const hidden = child.querySelector('.sr-only');
		expect(hidden?.textContent).toContain('開発本部');
		expect(getByRole('rowheader', { name: /^開発本部$/ }).querySelector('.sr-only')).toBeNull();
	});

	it('所属メンバーはその部署に直接所属する人数', () => {
		const { getByRole } = renderTable();
		// 子の行の名前は「開発本部 / バックエンド課」なので、 行見出しの名前で行を特定する。
		const countOf = (name: RegExp) =>
			getByRole('rowheader', { name }).closest('tr')!.querySelectorAll('td')[0].textContent;
		expect(countOf(/バックエンド課/)).toBe('2');
		expect(countOf(/^開発本部$/)).toBe('1');
	});

	it('並び替えのボタンは持たない', () => {
		const { container } = renderTable();
		expect(container.querySelector('th[aria-sort], thead button')).toBeNull();
	});
});
