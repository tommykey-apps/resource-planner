import { expect, test } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from '../fixtures/magic-link';

/**
 * アサイン一覧の日付欄の初期値。 URL に期間の指定がなければ今月の初日と末日を入れ、
 * 指定があればそれを優先する。 クリアした空の期間は再読み込みしても保つ。
 */

test.beforeEach(async () => {
	await clearMagicLinks();
});

async function signIn(page: import('@playwright/test').Page) {
	await page.goto('/sign-in');
	await page.fill('input[name="email"]', 'allowed@example.com');
	await page.click('button[type="submit"]');
	await expect(page).toHaveURL(/\/sign-in\/check-email/);
	const url = await getMagicLinkUrl('allowed@example.com');
	await page.goto(url);
	await expect(page).toHaveURL(/^http:\/\/localhost:4173\/(\?|$)/);
}

function ymd(d: Date): string {
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${d.getFullYear()}-${m}-${day}`;
}

test('URL に期間がなければ今月で絞り、 指定やクリアした空の期間はそれを使う', async ({ page }) => {
	await signIn(page);
	const now = new Date();
	const from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
	const to = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));

	await page.goto('/assignments');
	const fromInput = page.locator('input[type="date"]').nth(0);
	const toInput = page.locator('input[type="date"]').nth(1);
	await expect(fromInput).toHaveValue(from);
	await expect(toInput).toHaveValue(to);
	await expect(page).toHaveURL(new RegExp(`from=${from}.*to=${to}`));

	await page.goto('/assignments?from=2020-01-01');
	await expect(fromInput).toHaveValue('2020-01-01');
	await expect(toInput).toHaveValue('');

	// 条件をクリアした期間は、 再読み込みしても今月に戻らない
	await page.goto('/assignments');
	await expect(fromInput).toHaveValue(from);
	await page.getByRole('button', { name: 'Clear filters' }).click();
	await expect(fromInput).toHaveValue('');
	await expect(page).toHaveURL(/from=&to=/);
	await page.reload();
	await expect(fromInput).toHaveValue('');
	await expect(toInput).toHaveValue('');
});
