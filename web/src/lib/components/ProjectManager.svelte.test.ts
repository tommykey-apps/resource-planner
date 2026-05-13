// @vitest-environment jsdom
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ProjectManager from './ProjectManager.svelte';
import type { Project } from '$lib/types';

describe('ProjectManager (smoke)', () => {
	it('renders the trigger button with the project count', () => {
		const { getByRole } = render(ProjectManager, {
			props: { projects: [], assignments: [] }
		});
		expect(getByRole('button', { name: /案件を管理/ })).toBeInTheDocument();
	});

	it('shows count of provided projects in the trigger label', () => {
		const { getByRole } = render(ProjectManager, {
			props: {
				projects: [{ id: 'p1', name: 'Project A', color: '#ff0000' }],
				assignments: []
			}
		});
		expect(getByRole('button', { name: /\(1\)/ })).toBeInTheDocument();
	});

	it('phosphor svg icon visible + text label wrapped in sm:inline span (#96 / #105)', () => {
		const { getByRole } = render(ProjectManager, {
			props: { projects: [], assignments: [] }
		});
		const trigger = getByRole('button', { name: /案件を管理/ });
		const icon = trigger.querySelector('svg[aria-hidden="true"]');
		expect(icon).toBeTruthy();
		expect(trigger.textContent).not.toMatch(/📁/);
		expect(trigger.querySelector('.hidden.sm\\:inline')?.textContent).toMatch(/案件を管理/);
	});
});

/**
 * PR-N3 (#187): form を「+ Add project」 / 「Edit」 で開き、 詳細 section
 * (description / tags / links) が UI / data / a11y 契約を満たすことを固定。
 *
 * Dialog は body に Portal するので `document` 全体から探す。
 */
describe('ProjectManager form (PR-N3, refs #187)', () => {
	async function openCreateForm() {
		const utils = render(ProjectManager, { props: { projects: [], assignments: [] } });
		await fireEvent.click(utils.getByRole('button', { name: /案件を管理/ }));
		const addBtn = await waitFor(() => {
			return Array.from(document.querySelectorAll('button')).find((el) =>
				el.textContent?.includes('案件を追加')
			) as HTMLButtonElement;
		});
		await fireEvent.click(addBtn);
		const form = await waitFor(() => {
			const f = document.querySelector('form[action="?/createProject"]') as HTMLFormElement;
			if (!f) throw new Error('createProject form not rendered');
			return f;
		});
		return { form, ...utils };
	}

	async function openEditForm(project: Project) {
		const utils = render(ProjectManager, { props: { projects: [project], assignments: [] } });
		await fireEvent.click(utils.getByRole('button', { name: /案件を管理/ }));
		const editBtn = await waitFor(() => {
			return Array.from(document.querySelectorAll('button')).find((el) =>
				el.textContent?.trim().match(/^編集$/)
			) as HTMLButtonElement;
		});
		await fireEvent.click(editBtn);
		const form = await waitFor(() => {
			const f = document.querySelector('form[action="?/updateProject"]') as HTMLFormElement;
			if (!f) throw new Error('updateProject form not rendered');
			return f;
		});
		return { form, ...utils };
	}

	it('create form: 詳細 section is rendered (default closed for new project)', async () => {
		const { form } = await openCreateForm();
		const details = form.querySelector('details');
		expect(details).toBeTruthy();
		expect(details?.hasAttribute('open')).toBe(false);
	});

	it('create form: textarea[name=description], input[name=tags], hidden input[name=linksJson] が render される', async () => {
		const { form } = await openCreateForm();
		const desc = form.querySelector('textarea[name="description"]');
		const tags = form.querySelector('input[name="tags"]');
		const linksJson = form.querySelector('input[type="hidden"][name="linksJson"]') as HTMLInputElement;
		expect(desc).toBeTruthy();
		expect(tags).toBeTruthy();
		expect(linksJson).toBeTruthy();
		// initial: empty links → '[]'
		expect(linksJson.value).toBe('[]');
	});

	it('create form: tags input has aria-describedby pointing to hint (BP B7 a11y)', async () => {
		const { form } = await openCreateForm();
		const tags = form.querySelector('input[name="tags"]') as HTMLInputElement;
		const describedBy = tags.getAttribute('aria-describedby');
		expect(describedBy).toBeTruthy();
		const hint = describedBy ? form.querySelector(`#${describedBy}`) : null;
		expect(hint).toBeTruthy();
		expect(hint?.textContent ?? '').toMatch(/カンマ|comma/i);
	});

	it('edit form: 既存値ありの project では 詳細 section が default open', async () => {
		const { form } = await openEditForm({
			id: 'p1',
			name: 'P with detail',
			color: '#0EA5E9',
			description: 'body',
			tags: ['a', 'b'],
			links: [{ url: 'https://example.com', label: 'wiki' }]
		});
		const details = form.querySelector('details');
		expect(details?.hasAttribute('open')).toBe(true);
	});

	it('edit form: 既存値が field に復元される', async () => {
		const { form } = await openEditForm({
			id: 'p1',
			name: 'P with detail',
			color: '#0EA5E9',
			description: 'body markdown',
			tags: ['TypeScript', 'AWS'],
			links: [{ url: 'https://example.com', label: 'Wiki' }]
		});
		const desc = form.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
		const tags = form.querySelector('input[name="tags"]') as HTMLInputElement;
		const linksJson = form.querySelector(
			'input[type="hidden"][name="linksJson"]'
		) as HTMLInputElement;
		expect(desc.value).toBe('body markdown');
		expect(tags.value).toMatch(/TypeScript,\s*AWS/);
		expect(JSON.parse(linksJson.value)).toEqual([
			{ url: 'https://example.com', label: 'Wiki' }
		]);
	});

	it('edit form: 詳細無しの legacy project では 詳細 section が default closed', async () => {
		const { form } = await openEditForm({ id: 'p1', name: 'Legacy', color: '#000000' });
		const details = form.querySelector('details');
		expect(details?.hasAttribute('open')).toBe(false);
	});
});
