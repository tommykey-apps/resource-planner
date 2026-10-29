// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import DepartmentManager from './DepartmentManager.svelte';
import type { Department } from '$lib/types';

/**
 * #238 walking skeleton (ADR 0013): 部署の作成 + フラット一覧。
 * Dialog 内 (portal) の list/form は open 後にしか render されないため、 ここでは trigger
 * ボタンと件数表示のスモークを守る (作成 action の挙動は page.server.test がカバー)。
 */
const DEPARTMENTS: Department[] = [
	{ id: 'd1', name: '開発本部', parentId: null },
	{ id: 'd2', name: 'バックエンド課', parentId: 'd1' }
];

describe('DepartmentManager (#238)', () => {
	it('renders the manage trigger with the department count', () => {
		const { getByRole } = render(DepartmentManager, { props: { departments: DEPARTMENTS } });
		const btn = getByRole('button', { name: /部署|Department/ });
		expect(btn.textContent).toContain('2');
	});

	it('shows count 0 when there are no departments', () => {
		const { getByRole } = render(DepartmentManager, { props: { departments: [] } });
		expect(getByRole('button', { name: /部署|Department/ }).textContent).toContain('0');
	});
});

describe('DepartmentManager rename (#250)', () => {
	async function openEditFor(name: string) {
		render(DepartmentManager, { props: { departments: DEPARTMENTS } });
		await fireEvent.click(screen.getByRole('button', { name: /部署|Department/ }));
		const row = (await screen.findByText(name)).closest('li')!;
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
