import { expect, test } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';

/**
 * #142: /assignments を 375px 幅で開いたとき 6 列 table が右端で見切れていた問題の regression spec。
 *
 * 修正: `<sm` で card layout (`<ul>`)、 `>=sm` で従来 table を表示。 切替が tailwind の
 * `.sm:hidden` / `.hidden.sm:block` で行われていることを viewport を切り替えて assert する。
 *
 * 0 件状態ではどちらの container も描画されないため、 一気通貫で Resource / Project /
 * Assignment を 1 件作ってから /assignments を開く。
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

async function createOneAssignment(page: import('@playwright/test').Page, suffix: string) {
	// Resource 作成
	await page.getByRole('button', { name: /Manage people/ }).click();
	await page.getByRole('button', { name: /\+ Add person/ }).click();
	await page.getByLabel('Name').fill(`r-${suffix}`);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('li', { hasText: `r-${suffix}` })).toBeVisible();
	await page.keyboard.press('Escape');

	// Project 作成
	await page.getByRole('button', { name: /Manage projects/ }).click();
	await page.getByRole('button', { name: /\+ Add project/ }).click();
	await page.getByLabel('Project name').fill(`p-${suffix}`);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('li', { hasText: `p-${suffix}` })).toBeVisible();
	await page.keyboard.press('Escape');

	// Assignment 作成 (AssignmentCreator は label でなく select/date input、 デフォルト値で submit)
	await page.getByRole('button', { name: /Add assignment/ }).click();
	await page.getByRole('button', { name: /^Create$/ }).last().click();
}

test('viewport breakpoint で /assignments が card / table を切り替える (#142)', async ({ page }) => {
	// header の Manage / Add button は mobile (<sm) でテキストが hidden され accessible name が
	// 空になるため、 fixture 作成は **desktop viewport** で行う。 viewport breakpoint の挙動だけ
	// /assignments で確認するのが本 spec のスコープ。
	await page.setViewportSize({ width: 1280, height: 800 });
	await signIn(page);
	await createOneAssignment(page, `${Date.now()}`);

	// ── desktop viewport: table が見え、 card list は hidden ──
	await page.goto('/assignments');
	const table = page.locator('table');
	const cardList = page.getByRole('list', { name: /Assignments/ });
	await expect(table).toBeVisible();
	await expect(cardList).toBeHidden();

	// ── mobile viewport (375px): card list が見え、 table は hidden ──
	await page.setViewportSize({ width: 375, height: 800 });
	await expect(cardList).toBeVisible();
	await expect(table).toBeHidden();

	// edit / delete はカード内で visible (viewport 越え clipping なし)
	const firstItem = cardList.locator('li').first();
	const editBtn = firstItem.getByRole('button', { name: /^Edit$/ });
	const deleteBtn = firstItem.getByRole('button', { name: /^Delete$/ });
	await expect(editBtn).toBeVisible();
	await expect(deleteBtn).toBeVisible();
	// viewport 内 (x + width <= 375) であることを座標で確認
	const editBox = await editBtn.boundingBox();
	const deleteBox = await deleteBtn.boundingBox();
	expect(editBox).not.toBeNull();
	expect(deleteBox).not.toBeNull();
	if (editBox) expect(editBox.x + editBox.width).toBeLessThanOrEqual(375);
	if (deleteBox) expect(deleteBox.x + deleteBox.width).toBeLessThanOrEqual(375);
});
