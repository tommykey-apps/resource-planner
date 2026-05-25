// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AvatarDropdown from './AvatarDropdown.svelte';

/**
 * AvatarDropdown smoke test (#96)。
 *
 * Trigger button が email から生成した initial を表示し、aria-label でメニュー目的を
 * screen reader に伝える。実際のメニュー展開挙動は bits-ui DropdownMenu に依存するため
 * 本 test では trigger のレンダリングと a11y 属性のみ確認 (実展開は Playwright で smoke)。
 */
describe('AvatarDropdown (smoke)', () => {
	it('renders trigger with email initial when user.email is provided', () => {
		const { getByRole } = render(AvatarDropdown, {
			props: { email: 'alice@example.com', csrfToken: 'tok' }
		});
		const trigger = getByRole('button', { name: /ユーザーメニュー|account|menu/i });
		expect(trigger).toBeInTheDocument();
		// initial は email の先頭 1 文字 (uppercase)
		expect(trigger.textContent).toMatch(/A/);
	});

	it('uses aria-label that mentions the email for screen readers', () => {
		const { getByRole } = render(AvatarDropdown, {
			props: { email: 'bob@example.com', csrfToken: 'tok' }
		});
		const trigger = getByRole('button');
		const label = trigger.getAttribute('aria-label') ?? '';
		expect(label.toLowerCase()).toContain('bob@example.com'.toLowerCase());
	});

	it('falls back to "?" initial when email is empty/undefined', () => {
		const { getByRole } = render(AvatarDropdown, {
			props: { email: '', csrfToken: 'tok' }
		});
		const trigger = getByRole('button');
		expect(trigger.textContent).toMatch(/\?/);
	});
});
