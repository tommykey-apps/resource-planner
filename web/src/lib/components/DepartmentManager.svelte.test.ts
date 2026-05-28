// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
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
