import { expect, test } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';

/**
 * #132 / #148 で導入した imperative confirmDialog の表示 regression を防ぐ E2E。
 *
 * 元々の単体 test (src/lib/forms/confirm-dialog.test.ts) は store API のみで、
 * `<ConfirmDialog />` を mount したときに body へ Portal される
 * `role="alertdialog"` が画面に出るかは jsdom でも見れない (Portal target は body)。
 * 実機の bits-ui Portal + shadcn の Content の組み合わせがちゃんと render
 * されるところまでをここで保証する。
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

test('Resource delete: confirm dialog が画面に表示されて Cancel で閉じる (#132 / #148)', async ({
	page
}) => {
	await signInAsTestUser(page);

	// ヘッダの「Manage people」 button を開く (en は Accept-Language fallback の default)
	await page.getByRole('button', { name: /Manage people/ }).click();

	// 「+ Add person」 → Name 入力 → Create
	await page.getByRole('button', { name: /\+ Add person/ }).click();
	const uniqueName = `e2e-${Date.now()}`;
	await page.getByLabel('Name').fill(uniqueName);
	await page.getByRole('button', { name: /^Create$/ }).click();

	// 作成後の一覧で対象 row の「Delete」 を押す
	const row = page.locator('li', { hasText: uniqueName });
	await expect(row).toBeVisible();
	await row.getByRole('button', { name: /^Delete$/ }).click();

	// **本 spec の core**: AlertDialog が画面に visible (PR #148 で壊れる場所)
	const alert = page.getByRole('alertdialog');
	await expect(alert).toBeVisible();

	// Cancel で閉じれること
	await alert.getByRole('button', { name: /Cancel/ }).click();
	await expect(alert).toBeHidden();
});
