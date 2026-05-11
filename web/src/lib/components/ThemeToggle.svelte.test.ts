// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ThemeToggle from './ThemeToggle.svelte';

/**
 * ThemeToggle smoke test (#97)。
 *
 * `mode-watcher` の global state に依存するため、本 test では trigger button の
 * a11y 属性と icon (phosphor svg) の存在を確認するのみ。実際の cycle 動作は
 * Playwright smoke で検証。
 */
describe('ThemeToggle (smoke)', () => {
	it('renders a button with aria-label that mentions テーマ / theme', () => {
		const { getByRole } = render(ThemeToggle);
		const btn = getByRole('button');
		const label = btn.getAttribute('aria-label') ?? '';
		expect(label.toLowerCase()).toMatch(/テーマ|theme/);
	});

	it('contains a phosphor svg icon (aria-hidden) so screen reader uses aria-label only', () => {
		const { getByRole } = render(ThemeToggle);
		const btn = getByRole('button');
		const icon = btn.querySelector('svg[aria-hidden="true"]');
		expect(icon).toBeTruthy();
	});

	it('has focus-visible ring classes consistent with shadcn Button (#101 item 5)', () => {
		const { getByRole } = render(ThemeToggle);
		const btn = getByRole('button');
		expect(btn.className).toMatch(/focus-visible:ring/);
	});
});
