// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it, beforeEach } from 'vitest';
import LocaleSwitcher from './LocaleSwitcher.svelte';
import { localeState } from '$lib/i18n/index.svelte';

describe('LocaleSwitcher (smoke)', () => {
	beforeEach(() => {
		localeState.current = 'ja';
	});

	it('renders a button with phosphor svg icon and current locale code', () => {
		const { getByRole } = render(LocaleSwitcher);
		const btn = getByRole('button');
		expect(btn.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
		expect(btn.textContent).toContain('JA');
	});

	it('shows EN code when locale is en', () => {
		localeState.current = 'en';
		const { getByRole } = render(LocaleSwitcher);
		const btn = getByRole('button');
		expect(btn.textContent).toContain('EN');
	});

	it('uses aria-label that mentions language / 言語', () => {
		const { getByRole } = render(LocaleSwitcher);
		const btn = getByRole('button');
		const label = btn.getAttribute('aria-label') ?? '';
		expect(label.toLowerCase()).toMatch(/language|言語/);
	});

	it('has focus-visible ring classes consistent with shadcn Button (#101 item 5)', () => {
		const { getByRole } = render(LocaleSwitcher);
		const btn = getByRole('button');
		const cls = btn.className;
		expect(cls).toMatch(/focus-visible:ring/);
	});

	it('has cursor-pointer class consistent with shadcn Button (#124)', () => {
		const { getByRole } = render(LocaleSwitcher);
		expect(getByRole('button').className).toMatch(/\bcursor-pointer\b/);
	});
});
