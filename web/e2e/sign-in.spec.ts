import { expect, test } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';

/**
 * #113: Magic Link sign-in の E2E。 #109 (sign-in email input が disabled で form data
 * から消失) の真の regression guard を兼ねる — もし input が disabled に戻ったら
 * Auth.js は email を受け取れず token を作らないので、本 spec は magic link 取得
 * (file polling timeout) で必ず赤になる。
 *
 * test 間で session / token の共用は避けたいので serial 実行。
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async () => {
	await clearMagicLinks();
});

test('Magic Link sign-in completes the flow and lands on home (regression for #109)', async ({
	page
}) => {
	await page.goto('/sign-in');
	await page.fill('input[name="email"]', 'allowed@example.com');
	await page.click('button[type="submit"]');
	await expect(page).toHaveURL(/\/sign-in\/check-email/);

	const url = await getMagicLinkUrl('allowed@example.com');
	await page.goto(url);
	await expect(page).toHaveURL('/');
});

test('Direct navigation to /sign-in/check-email redirects to /sign-in (#101 guard)', async ({
	page
}) => {
	// 初回直接アクセス: sec-fetch-site: none → /sign-in に redirect
	await page.goto('/sign-in/check-email');
	await expect(page).toHaveURL(/\/sign-in($|\?)/);
});

test('Disallowed domain is rejected at submit before any email is sent', async ({ page }) => {
	await page.goto('/sign-in');
	await page.fill('input[name="email"]', 'evil@other.example');
	await page.click('button[type="submit"]');
	// Auth.js は signIn callback で domain チェック → 拒否時は token 発行 / 送信を行わずに error 画面へ
	await expect(page).toHaveURL(/\/sign-in\/error\?error=AccessDenied/);

	// 拒否されているので magic link は1件も captured されていないはず (漏洩無し)
	await expect(getMagicLinkUrl('evil@other.example', 500)).rejects.toThrow(/not captured/);
});
