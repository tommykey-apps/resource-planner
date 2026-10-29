import { expect, test } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';
import { openSection } from './fixtures/nav';

/**
 * 一覧の一括操作 (Carbon の batch actions に倣い、 行を選ぶと表の上に操作欄が出る)。
 * 選択状態と送信内容は単体テストで確認済みなので、 ここは実サーバーでの
 * 所属部署の一括変更 (1 transaction) と、 確認ダイアログを経た一括削除を確認する。
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

test('メンバーを選んで所属部署を一括変更し、 そのまま一括削除できる', async ({ page }) => {
	await signInAsTestUser(page);
	const suffix = Date.now();
	const department = `bulk-dept-${suffix}`;
	const names = [`bulk-a-${suffix}`, `bulk-b-${suffix}`];

	await openSection(page, 'Departments');
	await page.getByRole('button', { name: /\+ Add department/ }).click();
	await page.getByLabel('Department name').fill(department);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.getByRole('rowheader', { name: department })).toBeVisible();

	await openSection(page, 'People');
	for (const name of names) {
		await page.getByRole('button', { name: /\+ Add person/ }).click();
		await page.getByLabel('Name', { exact: true }).fill(name);
		await page.getByRole('button', { name: /^Create$/ }).click();
		await expect(page.locator('tr', { hasText: name })).toBeVisible();
	}
	await page.getByLabel('Filter by name').fill(String(suffix));
	await expect(page.getByRole('rowheader')).toHaveText(names);

	// 全選択 → 操作欄が出て、 行ごとの操作は止まる
	await page.getByRole('checkbox', { name: 'Select rows' }).check();
	const bar = page.getByRole('region', { name: 'Bulk actions' });
	await expect(bar).toContainText('2 selected');
	await expect(
		page.locator('tr', { hasText: names[0] }).getByRole('button', { name: /^Delete$/ })
	).toBeDisabled();

	// 所属部署の一括変更
	await bar.getByLabel('Change department').selectOption({ label: department });
	await bar.getByRole('button', { name: 'Change', exact: true }).click();
	await expect(page.getByText('Changed the department of 2 people')).toBeVisible();
	await expect(bar).toBeHidden();
	for (const name of names) {
		await expect(page.locator('tr', { hasText: name })).toContainText(department);
	}

	// 1 行だけ選んで一括削除。 確認ダイアログで取り消すと何も消えない
	await page.getByRole('checkbox', { name: names[0] }).check();
	await bar.getByRole('button', { name: 'Delete selected' }).click();
	const alert = page.getByRole('alertdialog');
	await alert.getByRole('button', { name: /Cancel/ }).click();
	await expect(alert).toBeHidden();
	await expect(page.getByRole('rowheader')).toHaveText(names);

	await bar.getByRole('button', { name: 'Delete selected' }).click();
	await alert.getByRole('button', { name: /^Delete$/ }).click();
	await expect(page.getByText('Deleted 1 people')).toBeVisible();
	await expect(page.getByRole('rowheader')).toHaveText([names[1]]);

	// 再読み込みしても消えたまま (サーバーで削除された)
	await page.reload();
	await expect(page.getByRole('rowheader')).toHaveText([names[1]]);
});
