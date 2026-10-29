import { expect, test } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';
import { openSection } from './fixtures/nav';

/**
 * #206: home の ResourceTimeline 帯 click で AssignmentEditor dialog が起動することを E2E で守る。
 *
 * 業界標準 (Google Calendar / Linear / Microsoft Project / Asana) と同じく single click で
 * detail / edit UI が出る挙動。 ui-components#85/#92 で click vs drag が threshold 4px で
 * 分離済のため、 微小移動の click は dialog 起動、 大きな移動は drag (handleUpdate) に分岐する。
 *
 * keyboard activation (Enter / Space on focused bar) も WAI-ARIA APG Button pattern に
 * 沿って実装済 (ui-components#92)。 本 spec では pointer click のみ assert (keyboard は
 * ui-components 側の test でカバー)。
 *
 * ADR 0007 amendment (#185): `+page.svelte` は E2E でカバーする方針。
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

async function bootstrap1Assignment(page: import('@playwright/test').Page, suffix: string) {
	await openSection(page, 'People');
	await page.getByRole('button', { name: /\+ Add person/ }).click();
	await page.locator('input[name="name"]').fill(`r-${suffix}`);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('li', { hasText: `r-${suffix}` })).toBeVisible();

	await openSection(page, 'Projects');
	await page.getByRole('button', { name: /\+ Add project/ }).click();
	await page.locator('input[name="name"]').fill(`p-${suffix}`);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('li', { hasText: `p-${suffix}` })).toBeVisible();

	await openSection(page, 'Timeline');
	await page.getByRole('button', { name: /Add assignment/ }).click();
	await page
		.getByRole('button', { name: /^Create$/ })
		.last()
		.click();
}

test('home: bar を click すると AssignmentEditor dialog が開く (#206)', async ({ page }) => {
	await signIn(page);
	await bootstrap1Assignment(page, `barclick-${Date.now()}`);
	await page.goto('/?d=2026-05-12&z=day');

	// bar が visible になるまで wait
	const firstBar = page.locator('div.bar, [class~="bar"]').first();
	await expect(firstBar).toBeVisible();

	// 微小移動 (click threshold 4px 未満) で click 扱いになる前提。 Playwright の click() は
	// pointerdown + pointerup を同 position で発火するので、 ui-components#92 の threshold 判定で
	// drag ではなく click に分岐する。
	await firstBar.click();

	// AssignmentEditor dialog が表示される (title = "Edit assignment" / "アサインを編集")
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();

	// dialog 内に form (resourceId / projectId / startDate / endDate select / input) が存在
	await expect(dialog.locator('select[name="resourceId"]')).toBeVisible();
	await expect(dialog.locator('select[name="projectId"]')).toBeVisible();
	await expect(dialog.locator('input[name="startDate"]')).toBeVisible();
	await expect(dialog.locator('input[name="endDate"]')).toBeVisible();

	// 閉じるボタン (Dialog.Close、 X icon、 #201 で追加) を click で dialog close
	await dialog.getByRole('button', { name: /Close|閉じる/ }).click();
	await expect(dialog).not.toBeVisible();
});
