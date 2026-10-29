import { expect, test } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';

/**
 * 言語の決定と切り替え (Paraglide JS)。
 * - 初回はブラウザの言語 (Accept-Language) で決まる
 * - 切り替えると cookie `resource-planner-locale` に保存され、 再読み込み後も残る
 * - SSR の <html lang> も同じ言語になる
 */

test.describe.configure({ mode: 'serial' });

test.beforeEach(async () => {
	await clearMagicLinks();
});

test('英語のブラウザで開き、 日本語に切り替えると再読み込み後も日本語のまま', async ({
	page,
	context
}) => {
	await page.goto('/sign-in');
	await page.fill('input[name="email"]', 'allowed@example.com');
	await page.click('button[type="submit"]');
	await expect(page).toHaveURL(/\/sign-in\/check-email/);
	await page.goto(await getMagicLinkUrl('allowed@example.com'));
	await expect(page).toHaveURL(/^http:\/\/localhost:4173\/(\?|$)/);

	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible();

	await page.getByRole('button', { name: /language/i }).click();
	await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
	await expect(page.getByRole('navigation', { name: 'メインメニュー' })).toBeVisible();
	const cookie = (await context.cookies()).find((c) => c.name === 'resource-planner-locale');
	expect(cookie?.value).toBe('ja');

	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
	await expect(page.getByRole('navigation', { name: 'メインメニュー' })).toBeVisible();
});

test('日本語のブラウザなら初回から日本語', async ({ browser }) => {
	const context = await browser.newContext({ locale: 'ja-JP' });
	const page = await context.newPage();
	await page.goto('/sign-in');
	await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
	await context.close();
});
