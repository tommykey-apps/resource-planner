import { expect, test, type Page } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';
import { openSection } from './fixtures/nav';

/**
 * 部署プルダウンの初期値 (ADR 0015)。 ログインユーザーのメールアドレスでメンバーを照合し、
 * タイムライン・アサイン一覧・メンバー一覧の部署プルダウンをその人の部署にする。
 *
 * ログインユーザー (allowed@example.com) のメンバーが残ると、 後続の spec の初期表示が
 * その部署に絞られてしまう。 終わったら必ず消す。
 */

const ME = 'allowed@example.com';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async () => {
	await clearMagicLinks();
});

async function signIn(page: Page) {
	await page.goto('/sign-in');
	await page.fill('input[name="email"]', ME);
	await page.click('button[type="submit"]');
	await expect(page).toHaveURL(/\/sign-in\/check-email/);
	await page.goto(await getMagicLinkUrl(ME));
	await expect(page).toHaveURL(/^http:\/\/localhost:4173\//);
}

async function deleteMyMember(page: Page) {
	await page.goto('/resources?dept=__all__');
	const row = page.locator('tr', { hasText: ME });
	if ((await row.count()) === 0) return;
	await row.getByRole('button', { name: /^Delete$/ }).click();
	await page
		.getByRole('alertdialog')
		.getByRole('button', { name: /^Delete$/ })
		.click();
	await expect(row).toHaveCount(0);
}

test.afterEach(async ({ page }) => {
	await deleteMyMember(page);
});

test('ログインユーザーの部署を 3 画面の部署プルダウンの初期値にし、 「すべて」は再読み込みしても保つ', async ({
	page
}) => {
	await signIn(page);
	const suffix = Date.now();
	const department = `mine-${suffix}`;
	const me = `me-${suffix}`;
	const other = `other-${suffix}`;

	await openSection(page, 'Departments');
	await page.getByRole('button', { name: /\+ Add department/ }).click();
	await page.getByLabel('Department name').fill(department);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.getByRole('rowheader', { name: department })).toBeVisible();

	// 照合できるメンバーがまだいないので、 初期値は「すべての部署」
	await openSection(page, 'People');
	const deptFilter = page.getByRole('combobox', { name: 'Department', exact: true });
	await expect(deptFilter.locator('option:checked')).toHaveText('All departments');

	await page.getByRole('button', { name: /\+ Add person/ }).click();
	await page.getByLabel('Name', { exact: true }).fill(me);
	// 大文字で登録しても、 小文字で保存して照合できる
	await page.getByLabel('Email', { exact: true }).fill(ME.toUpperCase());
	await page.getByRole('dialog').getByLabel('Department').selectOption({ label: department });
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('tr', { hasText: me })).toBeVisible();

	await page.getByRole('button', { name: /\+ Add person/ }).click();
	await page.getByLabel('Name', { exact: true }).fill(other);
	await page.getByLabel('Email', { exact: true }).fill(`${crypto.randomUUID()}@example.com`);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('tr', { hasText: other })).toBeVisible();

	// メンバー一覧: 開き直すと自分の部署で絞り込まれる
	await page.goto('/resources');
	await expect(deptFilter.locator('option:checked')).toHaveText(department);
	await expect(page.locator('tr', { hasText: me })).toBeVisible();
	await expect(page.locator('tr', { hasText: other })).toHaveCount(0);

	// 「すべての部署」を選ぶと URL に残り、 再読み込みしても保つ
	await deptFilter.selectOption({ label: 'All departments' });
	await expect(page).toHaveURL(/dept=__all__/);
	await page.reload();
	await expect(deptFilter.locator('option:checked')).toHaveText('All departments');
	await expect(page.locator('tr', { hasText: other })).toBeVisible();

	// 「絞り込みを解除」も「すべての部署」にする
	await page.goto('/resources');
	await page.getByRole('button', { name: 'Clear filters' }).click();
	await expect(page).toHaveURL(/dept=__all__/);

	// タイムライン
	await openSection(page, 'Timeline');
	const timelineFilter = page.locator('#timeline-dept-filter');
	await expect(timelineFilter.locator('option:checked')).toHaveText(department);
	await expect(page).toHaveURL(/dept=/);
	await timelineFilter.selectOption({ label: 'All departments' });
	await expect(page).toHaveURL(/dept=__all__/);
	await page.reload();
	await expect(timelineFilter.locator('option:checked')).toHaveText('All departments');

	// アサイン一覧
	await openSection(page, 'Assignments');
	const assignmentsFilter = page.getByRole('combobox', { name: 'Department', exact: true });
	await expect(assignmentsFilter.locator('option:checked')).toHaveText(department);
	await assignmentsFilter.selectOption({ label: 'All departments' });
	await expect(page).toHaveURL(/departmentId=__all__/);
	await page.reload();
	await expect(assignmentsFilter.locator('option:checked')).toHaveText('All departments');

	// 自分を未所属にすると、 初期値は「未所属」
	await page.goto('/resources?dept=__all__');
	await page
		.locator('tr', { hasText: me })
		.getByRole('button', { name: /^Edit$/ })
		.click();
	await page.getByRole('dialog').getByLabel('Department').selectOption({ label: 'Unassigned' });
	await page.getByRole('button', { name: /^Update$/ }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.goto('/resources');
	await expect(deptFilter.locator('option:checked')).toHaveText('Unassigned');
	await expect(page.locator('tr', { hasText: me })).toBeVisible();
});
