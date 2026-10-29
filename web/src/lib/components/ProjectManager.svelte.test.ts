// @vitest-environment jsdom
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ProjectManager from './ProjectManager.svelte';
import type { Project } from '$lib/types';

describe('ProjectManager (smoke)', () => {
	// header 標準化: 一覧はダイアログではなく `/projects` ページの本文に直接出す。
	it('一覧と追加 button をダイアログを開かずに直接 render する', () => {
		const { getByRole, getByText } = render(ProjectManager, {
			props: {
				projects: [{ id: 'p1', name: 'Project A', color: '#ff0000' }],
				assignments: []
			}
		});
		expect(getByRole('button', { name: /案件を追加/ })).toBeInTheDocument();
		expect(getByText('Project A')).toBeInTheDocument();
	});

	it('起動用の「案件を管理」 button を持たない', () => {
		const { queryByRole } = render(ProjectManager, { props: { projects: [], assignments: [] } });
		expect(queryByRole('button', { name: /案件を管理/ })).toBeNull();
	});

	it('0 件のときは空状態の文言を出す', () => {
		const { getByText } = render(ProjectManager, { props: { projects: [], assignments: [] } });
		expect(getByText('案件はありません。')).toBeInTheDocument();
	});

	it('削除 form は /?/deleteProject に送る (別ページからでも / の action に届く)', () => {
		const { container } = render(ProjectManager, {
			props: { projects: [{ id: 'p1', name: 'Project A', color: '#ff0000' }], assignments: [] }
		});
		expect(container.querySelector('form[action="/?/deleteProject"]')).toBeTruthy();
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
		const addBtn = await waitFor(() => {
			return Array.from(document.querySelectorAll('button')).find((el) =>
				el.textContent?.includes('案件を追加')
			) as HTMLButtonElement;
		});
		await fireEvent.click(addBtn);
		const form = await waitFor(() => {
			const f = document.querySelector('form[action="/?/createProject"]') as HTMLFormElement;
			if (!f) throw new Error('createProject form not rendered');
			return f;
		});
		return { form, ...utils };
	}

	async function openEditForm(project: Project) {
		const utils = render(ProjectManager, { props: { projects: [project], assignments: [] } });
		const editBtn = await waitFor(() => {
			return Array.from(document.querySelectorAll('button')).find((el) =>
				el.textContent?.trim().match(/^編集$/)
			) as HTMLButtonElement;
		});
		await fireEvent.click(editBtn);
		const form = await waitFor(() => {
			const f = document.querySelector('form[action="/?/updateProject"]') as HTMLFormElement;
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
		const linksJson = form.querySelector(
			'input[type="hidden"][name="linksJson"]'
		) as HTMLInputElement;
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
		expect(JSON.parse(linksJson.value)).toEqual([{ url: 'https://example.com', label: 'Wiki' }]);
	});

	it('edit form: 詳細無しの project で summary から開いた 詳細 は Preview / Write の切替で閉じない', async () => {
		const { form } = await openEditForm({ id: 'p1', name: 'Legacy', color: '#000000' });
		const details = form.querySelector('details') as HTMLDetailsElement;
		await fireEvent.click(details.querySelector('summary') as HTMLElement);
		await waitFor(() => expect(details.open).toBe(true));

		const tabs = form.querySelectorAll('[role="tab"]');
		await fireEvent.click(tabs[1] as HTMLElement);
		expect(details.open).toBe(true);
		await fireEvent.click(tabs[0] as HTMLElement);
		expect(details.open).toBe(true);
	});

	it('create form: summary から開いた 詳細 は 色の変更で閉じない', async () => {
		const { form } = await openCreateForm();
		const details = form.querySelector('details') as HTMLDetailsElement;
		await fireEvent.click(details.querySelector('summary') as HTMLElement);
		await waitFor(() => expect(details.open).toBe(true));

		const color = form.querySelector('input[name="color"]') as HTMLInputElement;
		await fireEvent.input(color, { target: { value: '#112233' } });
		expect(details.open).toBe(true);
	});

	it('edit form: 詳細無しの legacy project では 詳細 section が default closed', async () => {
		const { form } = await openEditForm({ id: 'p1', name: 'Legacy', color: '#000000' });
		const details = form.querySelector('details');
		expect(details?.hasAttribute('open')).toBe(false);
	});
});

/**
 * 案件 description の Markdown Write/Preview tab UI 契約。
 * - WAI-ARIA APG Tabs pattern: role=tablist / tab / tabpanel + aria-selected / aria-controls
 * - Write default、 Preview に切替で renderMarkdown 済 HTML 表示
 * - 両 tabpanel は常時 mount で form data (description) が switch 中も保持される
 */
describe('ProjectManager Markdown Write/Preview tabs', () => {
	async function openCreateFormDetails() {
		const utils = render(ProjectManager, { props: { projects: [], assignments: [] } });
		const addBtn = await waitFor(() => {
			return Array.from(document.querySelectorAll('button')).find((el) =>
				el.textContent?.includes('案件を追加')
			) as HTMLButtonElement;
		});
		await fireEvent.click(addBtn);
		const form = await waitFor(() => {
			const f = document.querySelector('form[action="/?/createProject"]') as HTMLFormElement;
			if (!f) throw new Error('createProject form not rendered');
			return f;
		});
		// 詳細 section を open
		const details = form.querySelector('details') as HTMLDetailsElement;
		details.open = true;
		await waitFor(() => {
			const tablist = form.querySelector('[role="tablist"]');
			if (!tablist) throw new Error('tablist not rendered');
		});
		return { form };
	}

	it('tablist + 2 tabs (Write / Preview) が render される (APG required)', async () => {
		const { form } = await openCreateFormDetails();
		const tablist = form.querySelector('[role="tablist"]') as HTMLElement;
		expect(tablist).toBeTruthy();
		expect(tablist.getAttribute('aria-label')).toBeTruthy();

		const tabs = form.querySelectorAll('[role="tab"]');
		expect(tabs).toHaveLength(2);
		expect(tabs[0]?.textContent ?? '').toMatch(/編集/);
		expect(tabs[1]?.textContent ?? '').toMatch(/プレビュー/);
	});

	it('default は Write tab (aria-selected=true、 Write panel visible / Preview panel hidden)', async () => {
		const { form } = await openCreateFormDetails();
		const tabs = form.querySelectorAll('[role="tab"]');
		expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
		expect(tabs[1]?.getAttribute('aria-selected')).toBe('false');
		const panels = form.querySelectorAll('[role="tabpanel"]');
		expect(panels[0]?.hasAttribute('hidden')).toBe(false);
		expect(panels[1]?.hasAttribute('hidden')).toBe(true);
	});

	it('Preview tab click で markdown が HTML render される + Write panel は hidden に', async () => {
		const { form } = await openCreateFormDetails();
		const textarea = form.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
		await fireEvent.input(textarea, { target: { value: '**bold** _italic_' } });

		const previewTab = form.querySelectorAll('[role="tab"]')[1] as HTMLElement;
		await fireEvent.click(previewTab);

		await waitFor(() => {
			const panels = form.querySelectorAll('[role="tabpanel"]');
			expect(panels[0]?.hasAttribute('hidden')).toBe(true);
			expect(panels[1]?.hasAttribute('hidden')).toBe(false);
			expect(panels[1]?.innerHTML ?? '').toContain('<strong>bold</strong>');
			expect(panels[1]?.innerHTML ?? '').toContain('<em>italic</em>');
		});
	});

	it('description 空 + Preview tab → empty 案内が出る', async () => {
		const { form } = await openCreateFormDetails();
		const previewTab = form.querySelectorAll('[role="tab"]')[1] as HTMLElement;
		await fireEvent.click(previewTab);
		const previewPanel = form.querySelectorAll('[role="tabpanel"]')[1] as HTMLElement;
		await waitFor(() => {
			expect(previewPanel.textContent ?? '').toMatch(/プレビューする内容/);
		});
	});

	it('Write → Preview → Write の往復で textarea の値が保持される (両 panel mount)', async () => {
		const { form } = await openCreateFormDetails();
		const textarea = form.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
		await fireEvent.input(textarea, { target: { value: 'hello' } });

		const tabs = form.querySelectorAll('[role="tab"]');
		await fireEvent.click(tabs[1] as HTMLElement);
		await fireEvent.click(tabs[0] as HTMLElement);

		const textarea2 = form.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
		expect(textarea2.value).toBe('hello');
	});
});
