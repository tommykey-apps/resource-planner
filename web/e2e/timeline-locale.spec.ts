import { expect, test, type Page } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';
import { openSection } from './fixtures/nav';

/**
 * タイムラインの見出しの月・曜日を画面の言語に合わせる (ui-components 1.1.0 の locale prop)。
 * 日本語では「5月」「4(月)」、 英語では「May」「4(Mon)」。
 * 他のテストの帯で canvas が翌年まで伸びると同じ見出しが複数出るので first() で見る。
 */

test.describe.configure({ mode: 'serial' });

test.beforeEach(async () => {
	await clearMagicLinks();
});

/** 英語の画面でサインインして要員を 1 人登録する (0 人だとタイムラインが出ない)。 */
async function signInWithPerson(page: Page) {
	await page.goto('/sign-in');
	await page.fill('input[name="email"]', 'allowed@example.com');
	await page.click('button[type="submit"]');
	await expect(page).toHaveURL(/\/sign-in\/check-email/);
	await page.goto(await getMagicLinkUrl('allowed@example.com'));
	await expect(page).toHaveURL(/^http:\/\/localhost:4173\/(\?|$)/);

	const person = `r-locale-${Date.now()}`;
	await openSection(page, 'People');
	await page.getByRole('button', { name: /\+ Add person/ }).click();
	await page.locator('input[name="name"]').fill(person);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('tr', { hasText: person })).toBeVisible();
}

test('日本語では月が「5月」、 曜日が「4(月)」', async ({ page, context }) => {
	await signInWithPerson(page);
	await context.addCookies([
		{ name: 'resource-planner-locale', value: 'ja', url: 'http://localhost:4173' }
	]);

	await page.goto('/?d=2026-05-04&z=month');
	await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
	await expect(page.locator('.header-cell', { hasText: /^5月$/ }).first()).toBeVisible();

	await page.goto('/?d=2026-05-04&z=day');
	await expect(page.locator('.header-cell', { hasText: /^4\(月\)$/ }).first()).toBeVisible();
});

test('英語では月が「May」、 曜日が「4(Mon)」', async ({ page }) => {
	await signInWithPerson(page);

	await page.goto('/?d=2026-05-04&z=month');
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.locator('.header-cell', { hasText: /^May$/ }).first()).toBeVisible();

	await page.goto('/?d=2026-05-04&z=day');
	await expect(page.locator('.header-cell', { hasText: /^4\(Mon\)$/ }).first()).toBeVisible();
});
