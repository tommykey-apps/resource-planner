import { expect, test } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';

/**
 * #140: optimistic create が server 400 で失敗したとき、 dialog が再 open して入力値が
 * 保持される regression spec。 PR #131 (#121) で実装された旧設計は dialog close + 入力破棄で
 * UX 退行していた。
 *
 * 400 を強制する手段: HTML5 `maxlength="100"` は user input のみを制限し、 Playwright の
 * `fill()` は JS で setValue するため越えて入る → server の zod `max(100, 'tooLong')` が
 * 400 を返す。
 */

test.describe.configure({ mode: 'serial' });

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

test('Resource create が tooLong で 400 → dialog 再 open + 入力値が保持される (#140)', async ({
	page
}) => {
	await signIn(page);

	const TOO_LONG = 'a'.repeat(101);

	await page.getByRole('button', { name: /Manage people/ }).click();
	await page.getByRole('button', { name: /\+ Add person/ }).click();

	// HTML5 `maxlength="100"` を一時的に外して 101 文字を入れる (server side の
	// zod max(100, 'tooLong') を踏ませて 400 を強制)。 input イベントを dispatch して
	// Svelte の bind:value も同期させる。
	const name = page.getByLabel('Name');
	await name.evaluate((el, value) => {
		(el as HTMLInputElement).removeAttribute('maxlength');
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setter?.call(el, value);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, TOO_LONG);
	await page.getByRole('button', { name: /^Create$/ }).click();

	// 失敗 path: dialog が再 open し、 入力値も保持
	const dialog = page.getByRole('dialog', { name: /Add person/ });
	await expect(dialog).toBeVisible();
	await expect(name).toHaveValue(TOO_LONG);

	// translateServerError 経由で en locale の "Name must be at most 100 characters" が表示
	await expect(dialog).toContainText(/Name must be at most 100 characters/);
});
