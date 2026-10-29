// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { overwriteGetLocale } from '$lib/paraglide/runtime';
import LocaleSwitcher from './LocaleSwitcher.svelte';

const { setLocale } = vi.hoisted(() => ({ setLocale: vi.fn() }));
vi.mock('$lib/paraglide/runtime', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/paraglide/runtime')>();
	// getLocale は overwriteGetLocale で差し替わる live binding。 spread で値を写すと
	// 差し替え前の関数が残るので、 名前空間経由で毎回読む。
	return { ...actual, getLocale: () => actual.getLocale(), setLocale };
});

describe('LocaleSwitcher (smoke)', () => {
	it('renders a button with phosphor svg icon and current locale code', () => {
		const { getByRole } = render(LocaleSwitcher);
		const btn = getByRole('button');
		expect(btn.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
		expect(btn.textContent).toContain('JA');
	});

	it('shows EN code when locale is en', () => {
		overwriteGetLocale(() => 'en');
		const { getByRole } = render(LocaleSwitcher);
		expect(getByRole('button').textContent).toContain('EN');
	});

	it('押すと もう一方の言語で setLocale を呼ぶ (Paraglide JS が cookie を書いて再読み込みする)', async () => {
		const { getByRole } = render(LocaleSwitcher);
		await fireEvent.click(getByRole('button'));
		expect(setLocale).toHaveBeenCalledWith('en');
	});

	it('uses aria-label that mentions language / 言語', () => {
		const { getByRole } = render(LocaleSwitcher);
		const label = getByRole('button').getAttribute('aria-label') ?? '';
		expect(label.toLowerCase()).toMatch(/language|言語/);
	});

	it('has focus-visible ring classes consistent with shadcn Button (#101 item 5)', () => {
		const { getByRole } = render(LocaleSwitcher);
		expect(getByRole('button').className).toMatch(/focus-visible:ring/);
	});

	it('has cursor-pointer class consistent with shadcn Button (#124)', () => {
		const { getByRole } = render(LocaleSwitcher);
		expect(getByRole('button').className).toMatch(/\bcursor-pointer\b/);
	});
});
