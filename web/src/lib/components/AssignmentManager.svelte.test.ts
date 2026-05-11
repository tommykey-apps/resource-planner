// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AssignmentManager from './AssignmentManager.svelte';
import type { Assignment, Project, Resource } from '$lib/types';

const sampleResources: Resource[] = [
	{ id: 'r1', name: 'Alice' },
	{ id: 'r2', name: 'Bob' }
];
const sampleProjects: Project[] = [
	{ id: 'p1', name: 'Atlas', color: '#4D72F3' },
	{ id: 'p2', name: 'Beacon', color: '#FF7755' }
];
const sampleAssignment: Assignment = {
	id: 'asn-1',
	resourceId: 'r1',
	projectId: 'p1',
	startDate: '2026-05-01',
	endDateExclusive: '2026-05-08'
};

describe('AssignmentManager (smoke)', () => {
	it('renders the trigger button with the assignment count', () => {
		const { getByRole } = render(AssignmentManager, {
			props: { assignments: [], resources: [], projects: [] }
		});
		expect(getByRole('button', { name: /アサイン一覧/ })).toBeInTheDocument();
	});

	it('phosphor svg icon visible + text label wrapped in sm:inline span (#96 / #105)', () => {
		const { getByRole } = render(AssignmentManager, {
			props: { assignments: [], resources: [], projects: [] }
		});
		const trigger = getByRole('button', { name: /アサイン一覧/ });
		const icon = trigger.querySelector('svg[aria-hidden="true"]');
		expect(icon).toBeTruthy();
		expect(trigger.textContent).not.toMatch(/📋/);
		expect(trigger.querySelector('.hidden.sm\\:inline')?.textContent).toMatch(/アサイン一覧/);
	});
});

describe('AssignmentManager — edit (#99 item 1)', () => {
	it('renders an edit button per assignment row when the list dialog is open', async () => {
		const { getByRole } = render(AssignmentManager, {
			props: {
				assignments: [sampleAssignment],
				resources: sampleResources,
				projects: sampleProjects
			}
		});
		// Trigger を click して list dialog を open
		await fireEvent.click(getByRole('button', { name: /アサイン一覧/ }));

		// 各行に edit button が存在
		const editBtns = screen.getAllByRole('button', { name: /編集/ });
		expect(editBtns.length).toBeGreaterThanOrEqual(1);
	});

	it('opens the edit dialog with form pre-filled and includes prevStartDate hidden input', async () => {
		const { getByRole } = render(AssignmentManager, {
			props: {
				assignments: [sampleAssignment],
				resources: sampleResources,
				projects: sampleProjects
			}
		});
		await fireEvent.click(getByRole('button', { name: /アサイン一覧/ }));
		const editBtn = screen.getAllByRole('button', { name: /編集/ })[0];
		await fireEvent.click(editBtn);

		// edit dialog 内の form action
		const form = document.querySelector(
			'form[action="?/updateAssignment"]'
		) as HTMLFormElement | null;
		expect(form).toBeTruthy();

		// hidden field: id + prevStartDate
		const idInput = form!.querySelector('input[name="id"]') as HTMLInputElement;
		expect(idInput?.value).toBe('asn-1');
		const prev = form!.querySelector('input[name="prevStartDate"]') as HTMLInputElement;
		expect(prev?.value).toBe('2026-05-01');

		// pre-fill: resource / project / start / end (inclusive 表示)
		const resourceSelect = within(form!).getByRole('combobox', {
			name: /人/
		}) as HTMLSelectElement;
		expect(resourceSelect.value).toBe('r1');
		const projectSelect = within(form!).getByRole('combobox', {
			name: /案件/
		}) as HTMLSelectElement;
		expect(projectSelect.value).toBe('p1');
		const startInput = form!.querySelector('input[name="startDate"]') as HTMLInputElement;
		expect(startInput.value).toBe('2026-05-01');
		// endDate は inclusive = endDateExclusive - 1 (ADR 0004 / displayEndDate)
		const endInput = form!.querySelector('input[name="endDate"]') as HTMLInputElement;
		expect(endInput.value).toBe('2026-05-07');
	});
});
