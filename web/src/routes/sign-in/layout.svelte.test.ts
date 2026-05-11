// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SignInLayout from './+layout.svelte';

/**
 * #123: /sign-in 系ページに ThemeToggle / LocaleSwitcher を右上 corner で表示する。
 * /sign-in / /sign-in/check-email / /sign-in/error すべてに継承される shared layout。
 */
describe('/sign-in +layout.svelte (#123)', () => {
	it('renders both ThemeToggle and LocaleSwitcher in a fixed right-top container', () => {
		const { container } = render(SignInLayout);
		// ThemeToggle: aria-label に "theme" or "テーマ" を含む
		const themeBtn = container.querySelector('button[aria-label*="テーマ"], button[aria-label*="theme" i]');
		expect(themeBtn).toBeTruthy();
		// LocaleSwitcher: aria-label に "言語" or "language" を含む
		const localeBtn = container.querySelector(
			'button[aria-label*="言語"], button[aria-label*="language" i]'
		);
		expect(localeBtn).toBeTruthy();
	});

	it('wraps the toggles in a fixed-position container at right-top so they overlay any page content', () => {
		const { container } = render(SignInLayout);
		const wrapper = container.querySelector('[data-testid="signin-layout-toggles"]');
		expect(wrapper).toBeTruthy();
		const cls = wrapper!.className;
		expect(cls).toMatch(/\bfixed\b/);
		expect(cls).toMatch(/right-/);
		expect(cls).toMatch(/top-/);
		expect(cls).toMatch(/\bz-/);
	});
});
