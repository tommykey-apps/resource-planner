// @vitest-environment jsdom
import { render, fireEvent } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SignInPage from './+page.svelte';
import type { PageData } from './$types';

/**
 * #109 regression: sign-in form の email input が submit 時に `disabled` 化されると、
 * HTML 仕様で disabled な input は form data から除外されるため、Auth.js が
 * `Missing email from request body` で reject する。
 *
 * 連打防止は維持しつつ、input は disabled にせず (readonly 化 or 触らない) で
 * form data に email が含まれることを保証する。
 */
const stubData = (): PageData => ({
	csrfToken: 'test-csrf',
	locale: 'ja',
	resources: [],
	projects: [],
	assignments: []
});

describe('sign-in +page.svelte — email input must remain in form data on submit (#109)', () => {
	it('does not set `disabled` on the email input after submit (would exclude it from form data)', async () => {
		const { container } = render(SignInPage, {
			props: { data: stubData() }
		});

		const form = container.querySelector('form') as HTMLFormElement;
		const emailInput = container.querySelector('input[name="email"]') as HTMLInputElement;
		expect(emailInput).toBeTruthy();
		emailInput.value = 'alice@example.com';

		// jsdom は実 navigation しないので preventDefault でガード
		form.addEventListener('submit', (e) => e.preventDefault());
		await fireEvent.submit(form);

		expect(emailInput.disabled).toBe(false);
	});

	it('still prevents double-submit by disabling the submit button', async () => {
		const { container } = render(SignInPage, {
			props: { data: stubData() }
		});

		const form = container.querySelector('form') as HTMLFormElement;
		const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;

		form.addEventListener('submit', (e) => e.preventDefault());
		await fireEvent.submit(form);

		expect(submitBtn.disabled).toBe(true);
	});

	it('includes the email value in FormData built from the form after submit', async () => {
		const { container } = render(SignInPage, {
			props: { data: stubData() }
		});

		const form = container.querySelector('form') as HTMLFormElement;
		const emailInput = container.querySelector('input[name="email"]') as HTMLInputElement;
		emailInput.value = 'alice@example.com';

		form.addEventListener('submit', (e) => e.preventDefault());
		await fireEvent.submit(form);

		// disabled な input は FormData に乗らない。submit 後の FormData に email
		// フィールドが含まれることが、本番 Auth.js が受け取れる条件。
		const fd = new FormData(form);
		expect(fd.get('email')).toBe('alice@example.com');
	});
});
