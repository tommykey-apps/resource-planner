// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ProjectDetailView from './ProjectDetailView.svelte';
import type { ProjectWithRenderedDescription } from '$lib/types';

const FULL: ProjectWithRenderedDescription = {
	id: 'p1',
	name: 'Project A',
	color: '#0EA5E9',
	description: '**bold**',
	descriptionHtml: '<p><strong>bold</strong></p>',
	tags: ['TypeScript', 'AWS'],
	links: [
		{ url: 'https://example.com/wiki', label: 'Wiki' },
		{ url: 'https://example.com/spec' } // label なし → URL を表示
	]
};

const MINIMAL: ProjectWithRenderedDescription = {
	id: 'p2',
	name: 'Minimal',
	color: '#10B981',
	descriptionHtml: '' // legacy item の load 結果
};

/**
 * Dialog 内 portal なので `document` 全体から探す。
 */
async function findInPortal<T extends HTMLElement = HTMLElement>(selector: string): Promise<T> {
	return await waitFor(() => {
		const el = document.querySelector(selector) as T | null;
		if (!el) throw new Error(`not found: ${selector}`);
		return el;
	});
}

describe('ProjectDetailView (PR-N4, refs #187)', () => {
	it('renders description as sanitized HTML via {@html descriptionHtml}', async () => {
		render(ProjectDetailView, { project: FULL, open: true });
		const dialog = await findInPortal('[role="dialog"]');
		const strong = dialog.querySelector('.prose strong');
		expect(strong).toBeTruthy();
		expect(strong?.textContent).toBe('bold');
	});

	it('renders tags as <li> chips', async () => {
		render(ProjectDetailView, { project: FULL, open: true });
		const dialog = await findInPortal('[role="dialog"]');
		const tagItems = Array.from(dialog.querySelectorAll('li'))
			.filter((li) => /TypeScript|AWS/.test(li.textContent ?? ''));
		expect(tagItems.length).toBeGreaterThanOrEqual(2);
	});

	it('renders links with target=_blank rel="noopener noreferrer" + sr-only "new tab" hint', async () => {
		render(ProjectDetailView, { project: FULL, open: true });
		const dialog = await findInPortal('[role="dialog"]');
		const anchor = dialog.querySelector('a[href="https://example.com/wiki"]') as HTMLAnchorElement;
		expect(anchor).toBeTruthy();
		expect(anchor.getAttribute('target')).toBe('_blank');
		expect(anchor.getAttribute('rel')).toBe('noopener noreferrer');
		// BP B7: sr-only で AT に「新規 tab で開く」 を伝える
		const srOnly = anchor.querySelector('.sr-only');
		expect(srOnly?.textContent).toMatch(/新規 tab|new tab/i);
	});

	it('falls back to URL as link text when label is empty', async () => {
		render(ProjectDetailView, { project: FULL, open: true });
		const dialog = await findInPortal('[role="dialog"]');
		const anchor = dialog.querySelector('a[href="https://example.com/spec"]') as HTMLAnchorElement;
		expect(anchor.textContent).toMatch(/https:\/\/example\.com\/spec/);
	});

	it('omits description / tags / links sections when project has no detail (legacy)', async () => {
		render(ProjectDetailView, { project: MINIMAL, open: true });
		const dialog = await findInPortal('[role="dialog"]');
		expect(dialog.querySelector('.prose')).toBeNull();
		expect(dialog.querySelector('a[target="_blank"]')).toBeNull();
	});
});
