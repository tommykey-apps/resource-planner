// @vitest-environment jsdom
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import Dialog from './Dialog.svelte';

/**
 * Dialog の overflow / mobile padding 挙動を保証 (#95)。
 *
 * Dialog が長いリスト (例: 22 件の resource) を含む場面で viewport を超えた時に
 * 内部スクロールで読めるようにする (max-h-[90vh] + overflow-y-auto)。
 * iPhone 12 (390px) では p-6 (24px) は両側 48px 取られて狭いので p-4 sm:p-6 に。
 */
describe('Dialog (smoke、#95 max-h + responsive padding)', () => {
	const childrenSnippet = createRawSnippet(() => ({
		render: () => '<div>テスト本文</div>'
	}));

	it('Content has max-h-[90vh] and overflow-y-auto for long content', () => {
		render(Dialog, {
			props: { open: true, title: 'テスト', children: childrenSnippet }
		});
		const content = screen.getByRole('dialog');
		const cls = content.className;
		expect(cls).toContain('max-h-[90vh]');
		expect(cls).toContain('overflow-y-auto');
	});

	it('Content uses p-4 on mobile and sm:p-6 on small+ screens', () => {
		render(Dialog, {
			props: { open: true, title: 'テスト', children: childrenSnippet }
		});
		const content = screen.getByRole('dialog');
		const cls = content.className;
		expect(cls).toContain('p-4');
		expect(cls).toContain('sm:p-6');
	});
});
