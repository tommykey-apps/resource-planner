import { expect, test } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';
import { openSection } from './fixtures/nav';

/**
 * 一覧の表 (DESIGN.md「一覧は表。 並び替え・絞り込み・件数・ページ送り」)。
 * 単体テストで並び替え・絞り込み・ページの計算は確認済みなので、 ここは実ブラウザでの
 * URL 往復 (再読み込みで状態が残る) と、 狭い画面の横スクロール領域を確認する。
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

test('メンバーの表: 絞り込みと並び替えが URL に残る', async ({ page }) => {
	await signInAsTestUser(page);
	const suffix = Date.now();
	const names = [`tbl-a-${suffix}`, `tbl-b-${suffix}`];

	await openSection(page, 'People');
	for (const name of names) {
		await page.getByRole('button', { name: /\+ Add person/ }).click();
		await page.getByLabel('Name', { exact: true }).fill(name);
		await page.getByRole('button', { name: /^Create$/ }).click();
		await expect(page.locator('tr', { hasText: name })).toBeVisible();
	}

	// 絞り込み: suffix で 2 件だけに絞る
	await page.getByLabel('Filter by name').fill(String(suffix));
	await expect(page).toHaveURL(new RegExp(`[?&]q=${suffix}`));
	const rowHeaders = page.getByRole('rowheader');
	await expect(rowHeaders).toHaveText(names);

	// 並び替え: 名前の列を押すと降順。 aria-sort も変わる
	await page.getByRole('button', { name: 'Name', exact: true }).click();
	await expect(page).toHaveURL(/[?&]dir=desc/);
	await expect(page.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
		'aria-sort',
		'descending'
	);
	await expect(rowHeaders).toHaveText([...names].reverse());

	// 再読み込みしても URL から同じ状態に戻る
	await page.reload();
	await expect(page.getByLabel('Filter by name')).toHaveValue(String(suffix));
	await expect(page.getByRole('rowheader')).toHaveText([...names].reverse());

	// 絞り込みを解除すると q が URL から消え、 並び順は残る
	await page.getByRole('button', { name: 'Clear filters' }).click();
	await expect(page).not.toHaveURL(/[?&]q=/);
	await expect(page).toHaveURL(/[?&]dir=desc/);
});

test('狭い画面では表が領域内で横スクロールし、 キーボードで focus できる', async ({ page }) => {
	await signInAsTestUser(page);
	await page.setViewportSize({ width: 375, height: 720 });
	await page.goto('/resources');

	const region = page.getByRole('region', { name: 'People' });
	await expect(region).toBeVisible();
	const overflow = await region.evaluate((el) => el.scrollWidth > el.clientWidth);
	expect(overflow).toBe(true);
	// ページ全体は横にスクロールしない (WCAG 1.4.10 Reflow)
	const pageOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth > window.innerWidth
	);
	expect(pageOverflow).toBe(false);
	await region.focus();
	await expect(region).toBeFocused();
});
