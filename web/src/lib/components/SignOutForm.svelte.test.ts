// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SignOutForm from './SignOutForm.svelte';

/**
 * #166: Auth.js v5 (@auth/core 0.41.x) は signout action でも csrfToken の
 * double-submit (cookie 値 === body 値) を必須にする。 sign-in と同じ pattern で
 * hidden input に SSR fetch 済 csrfToken を載せる。 SignOutForm はその hidden field
 * 構造を持つ最小 component (bits-ui Portal を介さず単体テストできる boundary)。
 */
describe('SignOutForm (#166)', () => {
	it('form は method=POST + action=/auth/signout (Auth Core endpoint 直接)', () => {
		const { container } = render(SignOutForm, {
			props: { csrfToken: 'tok-xyz', label: 'サインアウト' }
		});
		const form = container.querySelector('form');
		expect(form).toBeTruthy();
		expect(form?.getAttribute('method')?.toLowerCase()).toBe('post');
		expect(form?.getAttribute('action')).toBe('/auth/signout');
	});

	it('hidden input name="csrfToken" に props の値が乗る (MissingCSRF regression guard)', () => {
		const { container } = render(SignOutForm, {
			props: { csrfToken: 'tok-xyz', label: 'サインアウト' }
		});
		const input = container.querySelector('input[name="csrfToken"]') as HTMLInputElement | null;
		expect(input).toBeTruthy();
		expect(input?.getAttribute('type')).toBe('hidden');
		expect(input?.value).toBe('tok-xyz');
	});

	it('hidden input name="callbackUrl" は /sign-in (sign-out 後の着地先)', () => {
		const { container } = render(SignOutForm, {
			props: { csrfToken: 'tok', label: 'サインアウト' }
		});
		const input = container.querySelector('input[name="callbackUrl"]') as HTMLInputElement | null;
		expect(input).toBeTruthy();
		expect(input?.getAttribute('type')).toBe('hidden');
		expect(input?.value).toBe('/sign-in');
	});

	it('submit button に label prop の文字が出る (i18n は呼び元で解決)', () => {
		const { getByRole } = render(SignOutForm, {
			props: { csrfToken: 'tok', label: 'Sign out' }
		});
		const btn = getByRole('button', { name: 'Sign out' });
		expect(btn).toBeInTheDocument();
		expect(btn.getAttribute('type')).toBe('submit');
	});
});
