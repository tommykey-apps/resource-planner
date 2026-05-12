import { expect, test } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';

/**
 * Home (/) を sign-in 後に開いた時の **visual layout regression** を守る spec。
 *
 * 経緯: ui-components 0.6.0 → 0.7.0 bump で `<ResourceTimeline resourceColWidth="auto">`
 * を opt-in した結果、 sticky な resource rail が CSS Grid の column sizing と相互作用
 * して **column 1 が 1px に潰れる** 本番事故が起きた。 unit / build / check / 既存 e2e は
 * 全て緑だったが、 home の実 layout を assert する e2e が存在しなかったため検知できず。
 *
 * 本 spec の責務:
 *   - timeline / resource rail / bar が **viewport 内で見える幅** を持っていること
 *   - rail が極端に縮んでない (= 1px 等の collapse) こと
 *   - bar の label が rail の上に重なってない (= rail と bar が disjoint な x 範囲)
 *
 * これらは visual diff (Percy 等) 無しで bounding box の数値検査だけで成立する。
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
	// crud-flow.spec.ts と同じ pattern (EN locale 前提、 CI default の Accept-Language)
	await page.getByRole('button', { name: /Manage people/ }).click();
	await page.getByRole('button', { name: /\+ Add person/ }).click();
	await page.locator('input[name="name"]').fill(`r-${suffix}`);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('li', { hasText: `r-${suffix}` })).toBeVisible();
	await page.keyboard.press('Escape');

	await page.getByRole('button', { name: /Manage projects/ }).click();
	await page.getByRole('button', { name: /\+ Add project/ }).click();
	await page.locator('input[name="name"]').fill(`p-${suffix}`);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('li', { hasText: `p-${suffix}` })).toBeVisible();
	await page.keyboard.press('Escape');

	await page.getByRole('button', { name: /Add assignment/ }).click();
	await page.getByRole('button', { name: /^Create$/ }).last().click();
}

test('home: ResourceTimeline の rail が collapse せず、 bar も visible', async ({ page }) => {
	await signIn(page);
	await bootstrap1Assignment(page, `layout-${Date.now()}`);
	await page.goto('/?d=2026-05-12&z=day');

	// timeline 全体
	const timeline = page.locator('div.timeline, [class~="timeline"]').first();
	await expect(timeline).toBeVisible();

	// resource rail: 元の固定幅 200px (#34 rollback) または auto-fit の minmax 100 → 100px 以上
	// 1px に潰れたら fail。 spec の本質は「collapse 検出」
	const rail = page.locator('aside.resources, [class~="resources"]').first();
	await expect(rail).toBeVisible();
	const railBox = await rail.boundingBox();
	expect(railBox).not.toBeNull();
	expect(
		railBox!.width,
		`resource rail width=${railBox!.width}px (#34 collapse regression — expected ~200px)`
	).toBeGreaterThan(50);

	// bar: 1 件以上見えてること + label が読める幅
	const firstBar = page.locator('div.bar, [class~="bar"]').first();
	await expect(firstBar).toBeVisible();
	const barBox = await firstBar.boundingBox();
	expect(barBox).not.toBeNull();
	expect(barBox!.width).toBeGreaterThan(20);

	// header の col 2 (canvas) が rail の右側に位置 (= column 1 = rail が collapse してない結果)
	const headers = page.locator('div.headers, [class~="headers"]').first();
	const headersBox = await headers.boundingBox();
	expect(headersBox).not.toBeNull();
	expect(
		headersBox!.x,
		`headers.x=${headersBox!.x} but rail.right=${railBox!.x + railBox!.width}: ` +
			'rail と canvas (headers) が重なっている = column 1 が collapse'
	).toBeGreaterThanOrEqual(railBox!.x + railBox!.width - 5);
});
