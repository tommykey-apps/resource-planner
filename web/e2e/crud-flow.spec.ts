import { expect, test } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';

/**
 * CRUD full path E2E (#155 で可視化した P0 coverage の埋め)。
 *
 * sign-in → Resource 作成 → Project 作成 → /assignments で確認 → ホームに戻って delete →
 * の一気通貫を 1 spec で固定する。 個々の repository / action / component 単体は別 test で
 * 担保しているので、 ここは **境界の繋ぎ** + 削除 confirm dialog の interaction を assert する。
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

test('Resource + Project の作成 → delete confirm まで一気通貫で機能 (#155)', async ({ page }) => {
	await signInAsTestUser(page);

	const resourceName = `e2e-crud-r-${Date.now()}`;
	const projectName = `e2e-crud-p-${Date.now()}`;

	// ── Resource 作成 (ヘッダ「Manage people」→ 「+ Add person」)
	await page.getByRole('button', { name: /Manage people/ }).click();
	await page.getByRole('button', { name: /\+ Add person/ }).click();
	await page.getByLabel('Name').fill(resourceName);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('li', { hasText: resourceName })).toBeVisible();

	// dialog 外側クリックで close (Manage people dialog)
	await page.keyboard.press('Escape');
	await expect(page.locator('li', { hasText: resourceName })).toBeHidden();

	// ── Project 作成 (ヘッダ「Manage projects」→ 「+ Add project」)
	await page.getByRole('button', { name: /Manage projects/ }).click();
	await page.getByRole('button', { name: /\+ Add project/ }).click();
	// Project は「Project name」 label
	await page.getByLabel('Project name').fill(projectName);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('li', { hasText: projectName })).toBeVisible();

	// ── Resource を delete → ConfirmDialog が出て Confirm
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: /Manage people/ }).click();
	const row = page.locator('li', { hasText: resourceName });
	await expect(row).toBeVisible();
	await row.getByRole('button', { name: /^Delete$/ }).click();

	const alert = page.getByRole('alertdialog');
	await expect(alert).toBeVisible();
	await expect(alert).toContainText(resourceName);
	await alert.getByRole('button', { name: /^Delete$/ }).click();
	await expect(alert).toBeHidden();

	// 削除後は list から消える
	await expect(page.locator('li', { hasText: resourceName })).toBeHidden();
});
