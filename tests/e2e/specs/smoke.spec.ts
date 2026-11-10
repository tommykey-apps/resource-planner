import { expect, test } from '@playwright/test';

/**
 * 最小 smoke spec (#112)。未認証で `/` にアクセスすると `/sign-in` にリダイレクトされることを
 * 検証する。Auth.js + DDB が初期化済、redirect logic が正常動作している、の 2 点を CI で守る。
 *
 * Magic Link 経由の sign-in fixture / 認証済 spec は #113 で別途追加。
 */
test('unauthenticated access to / redirects to /sign-in', async ({ page }) => {
	const response = await page.goto('/');
	expect(response).not.toBeNull();
	expect(response!.status()).toBeLessThan(400);
	await expect(page).toHaveURL(/\/sign-in($|\?)/);
});

test('/sign-in renders the email sign-in form', async ({ page }) => {
	await page.goto('/sign-in');
	await expect(page.locator('input[name="email"]')).toBeVisible();
	await expect(page.locator('button[type="submit"]')).toBeVisible();
});
