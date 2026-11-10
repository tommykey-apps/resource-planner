// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ErrorPage from './+page.svelte';

/**
 * #101 item 2: /sign-in/error を `+error.svelte` と同じ centered-card 構造に揃える。
 *
 * 404 / +error.svelte は `<main>` を `min-h-screen` + flex centered + `.card` で構成済。
 * /sign-in/error も同じパターンに揃え、視覚的不整合を解消する。
 */
describe('/sign-in/error +page.svelte — centered card layout (#101)', () => {
	it('renders main element with min-height: 100vh wrapper for vertical centering', () => {
		const { container } = render(ErrorPage);
		const main = container.querySelector('main');
		expect(main).toBeTruthy();
		// Tailwind `min-h-screen` (= min-height: 100vh) を含む
		expect(main!.className).toMatch(/min-h-screen/);
	});

	it('places content inside a flex-centered layout (matches +error.svelte alignment)', () => {
		const { container } = render(ErrorPage);
		const main = container.querySelector('main');
		expect(main!.className).toMatch(/flex/);
		expect(main!.className).toMatch(/items-center/);
		expect(main!.className).toMatch(/justify-center/);
	});

	it('renders the error code paragraph and back-to-signin link', () => {
		const { getByRole, getByText } = render(ErrorPage);
		// errorCode 表記が出る (i18n の signin.errorCode)
		expect(getByText(/エラーコード/)).toBeTruthy();
		const link = getByRole('link', { name: /サインインに戻る/ });
		expect(link.getAttribute('href')).toBe('/sign-in');
	});
});
