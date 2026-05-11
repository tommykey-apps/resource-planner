// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AssignmentEditor from './AssignmentEditor.svelte';
import type { Assignment, Project, Resource } from '$lib/types';

/**
 * AssignmentEditor の form 契約 (open=true で assignment を渡したときに form が初期化される、
 * select / date input がフォームに乗る、 inclusive endDate 表示 ↔ exclusive 保存の境界 が
 * 親 API に出てこない) を test で固定する。
 *
 * Dialog wrapper (BitsDialog) は body に Portal するので、 jsdom 上では `document` から拾う。
 */

const RESOURCES: Resource[] = [
	{ id: 'r1', name: 'Alice' },
	{ id: 'r2', name: 'Bob' }
];
const PROJECTS: Project[] = [
	{ id: 'p1', name: 'Project A', color: '#0EA5E9' },
	{ id: 'p2', name: 'Project B', color: '#10B981' }
];

const SAMPLE: Assignment = {
	id: 'asn-1',
	resourceId: 'r1',
	projectId: 'p2',
	startDate: '2026-05-01',
	endDateExclusive: '2026-05-08' // inclusive 表示は 2026-05-07
};

async function findInPortal<T extends HTMLElement = HTMLElement>(
	selector: string
): Promise<T> {
	return await waitFor(() => {
		const el = document.querySelector(selector) as T | null;
		if (!el) throw new Error(`not found: ${selector}`);
		return el;
	});
}

describe('AssignmentEditor (#100)', () => {
	it('open=false のとき form は描画されない', () => {
		render(AssignmentEditor, {
			props: { open: false, assignment: SAMPLE, resources: RESOURCES, projects: PROJECTS }
		});
		expect(document.querySelector('form[action="/?/updateAssignment"]')).toBeNull();
	});

	it('open=true で assignment を渡すと form が描画され、 hidden の id / prevStartDate が assignment に一致', async () => {
		render(AssignmentEditor, {
			props: { open: true, assignment: SAMPLE, resources: RESOURCES, projects: PROJECTS }
		});
		const form = await findInPortal<HTMLFormElement>('form[action="/?/updateAssignment"]');
		const idInput = form.querySelector('input[name="id"]') as HTMLInputElement;
		const prev = form.querySelector('input[name="prevStartDate"]') as HTMLInputElement;
		expect(idInput.value).toBe('asn-1');
		expect(prev.value).toBe('2026-05-01');
	});

	it('select[name=resourceId] / projectId に全候補が出て、 assignment の値が選択済', async () => {
		render(AssignmentEditor, {
			props: { open: true, assignment: SAMPLE, resources: RESOURCES, projects: PROJECTS }
		});
		await findInPortal('form[action="/?/updateAssignment"]');
		const resourceSelect = document.querySelector(
			'select[name="resourceId"]'
		) as HTMLSelectElement;
		const projectSelect = document.querySelector('select[name="projectId"]') as HTMLSelectElement;
		expect(Array.from(resourceSelect.options).map((o) => o.value)).toEqual(['r1', 'r2']);
		expect(resourceSelect.value).toBe('r1');
		expect(Array.from(projectSelect.options).map((o) => o.value)).toEqual(['p1', 'p2']);
		expect(projectSelect.value).toBe('p2');
	});

	it('endDate input は inclusive 表示 (endDateExclusive - 1 day = 2026-05-07、 ADR 0004)', async () => {
		render(AssignmentEditor, {
			props: { open: true, assignment: SAMPLE, resources: RESOURCES, projects: PROJECTS }
		});
		await findInPortal('form[action="/?/updateAssignment"]');
		const endDate = document.querySelector('input[name="endDate"]') as HTMLInputElement;
		const startDate = document.querySelector('input[name="startDate"]') as HTMLInputElement;
		expect(startDate.value).toBe('2026-05-01');
		expect(endDate.value).toBe('2026-05-07');
	});

	it('endDate input の min は startDate と reactive に連動 (UC ガード)', async () => {
		render(AssignmentEditor, {
			props: { open: true, assignment: SAMPLE, resources: RESOURCES, projects: PROJECTS }
		});
		await findInPortal('form[action="/?/updateAssignment"]');
		const endDate = document.querySelector('input[name="endDate"]') as HTMLInputElement;
		expect(endDate.getAttribute('min')).toBe('2026-05-01');
	});

	it('Cancel / Update ボタンの type が button / submit (誤 submit 防止)', async () => {
		render(AssignmentEditor, {
			props: { open: true, assignment: SAMPLE, resources: RESOURCES, projects: PROJECTS }
		});
		await findInPortal('form[action="/?/updateAssignment"]');
		const buttons = Array.from(
			document.querySelectorAll('button[type]')
		) as HTMLButtonElement[];
		const submitBtns = buttons.filter((b) => b.type === 'submit');
		const cancelBtns = buttons.filter((b) => b.type === 'button');
		expect(submitBtns.length).toBeGreaterThanOrEqual(1);
		expect(cancelBtns.length).toBeGreaterThanOrEqual(1);
	});

	it('assignment が null のとき hidden id / prevStartDate は描画されない (新規モードのガード)', async () => {
		render(AssignmentEditor, {
			props: { open: true, assignment: null, resources: RESOURCES, projects: PROJECTS }
		});
		const form = await findInPortal<HTMLFormElement>('form[action="/?/updateAssignment"]');
		expect(form.querySelector('input[name="id"]')).toBeNull();
		expect(form.querySelector('input[name="prevStartDate"]')).toBeNull();
	});
});
