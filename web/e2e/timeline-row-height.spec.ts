import { expect, test, type Page } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';
import { openSection } from './fixtures/nav';

/**
 * 表示開始日より前に終わる帯は見えないので、 行の高さ (段の数) に数えない。
 * ui-components 1.0.0 では過去の帯同士の重なりで行が 2 段分の高さになっていた
 * (ui-components#97 で修正、 1.0.1 以降)。
 */

test.describe.configure({ mode: 'serial' });

test.beforeEach(async () => {
	await clearMagicLinks();
});

async function signIn(page: Page) {
	await page.goto('/sign-in');
	await page.fill('input[name="email"]', 'allowed@example.com');
	await page.click('button[type="submit"]');
	await expect(page).toHaveURL(/\/sign-in\/check-email/);
	const url = await getMagicLinkUrl('allowed@example.com');
	await page.goto(url);
	await expect(page).toHaveURL(/^http:\/\/localhost:4173\/(\?|$)/);
}

async function addAssignment(
	page: Page,
	person: string,
	project: string,
	start: string,
	end: string
) {
	await page.getByRole('button', { name: /Add assignment/ }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('select[name="resourceId"]').selectOption({ label: person });
	await dialog.locator('select[name="projectId"]').selectOption({ label: project });
	await dialog.locator('input[name="startDate"]').fill(start);
	await dialog.locator('input[name="endDate"]').fill(end);
	await dialog.getByRole('button', { name: /^Create$/ }).click();
	await expect(dialog).not.toBeVisible();
}

test('表示開始日より前に終わる帯は行の高さに影響しない', async ({ page }) => {
	const suffix = `rowh-${Date.now()}`;
	const person = `r-${suffix}`;
	const project = `p-${suffix}`;
	await signIn(page);

	await openSection(page, 'People');
	await page.getByRole('button', { name: /\+ Add person/ }).click();
	await page.locator('input[name="name"]').fill(person);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('tr', { hasText: person })).toBeVisible();

	await openSection(page, 'Projects');
	await page.getByRole('button', { name: /\+ Add project/ }).click();
	await page.locator('input[name="name"]').fill(project);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('tr', { hasText: project })).toBeVisible();

	await openSection(page, 'Timeline');
	// 5/4-5/14 と 5/6-5/12 は重なるので 2 段。 5/18-5/29 は別期間
	await addAssignment(page, person, project, '2026-05-04', '2026-05-14');
	await addAssignment(page, person, project, '2026-05-06', '2026-05-12');
	await addAssignment(page, person, project, '2026-05-18', '2026-05-29');

	const row = page.locator('.resource-row', { hasText: person });

	await page.goto('/?d=2026-05-04&z=day');
	await expect(row).toBeVisible();
	const twoLanes = (await row.boundingBox())!.height;

	// 重なる 2 本はどちらも 5/16 より前に終わる → 見えるのは 5/18-5/29 の 1 本だけ
	await page.goto('/?d=2026-05-16&z=day');
	await expect(row).toBeVisible();
	const oneLane = (await row.boundingBox())!.height;

	expect(oneLane).toBeLessThan(twoLanes);
});
