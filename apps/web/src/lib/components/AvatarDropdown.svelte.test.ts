// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AvatarDropdown from './AvatarDropdown.svelte';

const { setMode } = vi.hoisted(() => ({ setMode: vi.fn() }));
vi.mock('mode-watcher', async (importOriginal) => ({
	...(await importOriginal<typeof import('mode-watcher')>()),
	setMode
}));

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

/**
 * header 標準化: テーマ切替をヘッダー直置きの button からアバターメニュー内の
 * 選択肢 (ライト / ダーク / システム) へ移す。 現在値は menuitemradio の aria-checked で示す。
 */
describe('AvatarDropdown — テーマ選択', () => {
	async function openMenu() {
		const utils = render(AvatarDropdown, {
			props: { email: 'alice@example.com', csrfToken: 'tok' }
		});
		await fireEvent.keyDown(utils.getByRole('button'), { key: 'Enter' });
		return utils;
	}

	it('メニューにテーマの選択肢 3 つ (ライト / ダーク / システム) を出す', async () => {
		await openMenu();
		const radios = await screen.findAllByRole('menuitemradio');
		expect(radios.map((r) => r.textContent?.trim())).toEqual(['ライト', 'ダーク', 'システム']);
	});

	it('選択肢を押すと mode-watcher の setMode に渡す', async () => {
		await openMenu();
		await fireEvent.click(await screen.findByRole('menuitemradio', { name: 'ダーク' }));
		expect(setMode).toHaveBeenCalledWith('dark');
	});
});
