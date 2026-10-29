import { expect, test } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';
import { openSection } from './fixtures/nav';

/**
 * header 標準化: ヘッダーの水平メニュー (グローバルナビ) と、 狭い画面のハンバーガーメニュー。
 * 現在地 (aria-current) と、 各上位区画ページが表示されることを実機で確認する。
 */

test.describe.configure({ mode: 'serial' });

test.beforeEach(async () => {
	await clearMagicLinks();
});

async function signInAsTestUser(page: import('@playwright/test').Page) {
	await page.goto('/sign-in');
	await page.fill('input[name="email"]', 'allowed@example.com');
	await page.click('button[type="submit"]');
	await expect(page).toHaveURL(/\/sign-in\/check-email/);
	const url = await getMagicLinkUrl('allowed@example.com');
	await page.goto(url);
	await expect(page).toHaveURL(/^http:\/\/localhost:4173\/(\?|$)/);
}

test('水平メニューで各上位区画へ移動し、 現在地に aria-current="page" が付く', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await signInAsTestUser(page);
	const nav = page.getByRole('navigation', { name: 'Main menu' });

	for (const [name, heading] of [
		['People', 'People'],
		['Projects', 'Projects'],
		['Departments', 'Departments'],
		['Assignments', 'Assignments'],
		['Timeline', 'Timeline']
	] as const) {
		await openSection(page, name);
		await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
		await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute(
			'aria-current',
			'page'
		);
	}
});

test('狭い画面ではハンバーガーメニューで水平メニューを開閉する', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 800 });
	await signInAsTestUser(page);
	const nav = page.getByRole('navigation', { name: 'Main menu' });
	const toggle = page.getByRole('button', { name: 'Menu', exact: true });

	await expect(nav).toBeHidden();
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await nav.getByRole('link', { name: 'Projects', exact: true }).click();
	await expect(page).toHaveURL(/\/projects$/);
	await expect(nav).toBeHidden();
});
