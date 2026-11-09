import { expect, test, type Page } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';
import { openSection } from './fixtures/nav';

/**
 * 案件一覧の部署と期間の絞り込み、 部署を消したときの案件 (ADR 0016)。
 *
 * 初期値はログインユーザーの部署 × 今月。 ログインユーザー (allowed@example.com) のメンバーが
 * 残ると後続の spec の初期表示がその部署に絞られるので、 終わったら必ず消す。
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

function ymd(d: Date): string {
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${d.getFullYear()}-${m}-${day}`;
}

async function createProject(page: Page, name: string, department: string) {
	await page.getByRole('button', { name: /\+ Add project/ }).click();
	await page.getByLabel('Project name').fill(name);
	await page.getByRole('dialog').getByLabel('Department').selectOption({ label: department });
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('既定は自分の部署 × 今月。 期間を「すべて」にすると割り当てのない案件も出る。 部署を消すと案件は未所属になる', async ({
	page
}) => {
	await signIn(page);
	const suffix = Date.now();
	const department = `dept-${suffix}`;
	const me = `me-${suffix}`;
	const active = `active-${suffix}`;
	const idle = `idle-${suffix}`;

	// 部署と、 その部署に属する自分のメンバー
	await openSection(page, 'Departments');
	await page.getByRole('button', { name: /\+ Add department/ }).click();
	await page.getByLabel('Department name').fill(department);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.getByRole('rowheader', { name: department })).toBeVisible();

	await openSection(page, 'People');
	await page.getByRole('button', { name: /\+ Add person/ }).click();
	await page.getByLabel('Name', { exact: true }).fill(me);
	await page.getByLabel('Email', { exact: true }).fill(ME);
	await page.getByRole('dialog').getByLabel('Department').selectOption({ label: department });
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('tr', { hasText: me })).toBeVisible();

	// 案件を 2 つ作る。 作ったばかりで割り当てがないので、 今月の一覧には出ない。
	// 部署の初期値はページを読み込んだときのメンバーで決まるので、 開き直す (default-department.spec と同じ)
	await page.goto('/projects');
	await createProject(page, active, department);
	await createProject(page, idle, department);
	await expect(
		page.getByRole('combobox', { name: 'Department', exact: true }).locator('option:checked')
	).toHaveText(department);
	await expect(page.getByRole('combobox', { name: 'Period' }).locator('option:checked')).toHaveText(
		'This month'
	);
	await expect(page.locator('tr', { hasText: active })).toHaveCount(0);

	// 片方に今日の割り当てを入れる
	await openSection(page, 'Timeline');
	await page
		.getByRole('button', { name: /Add assignment/ })
		.first()
		.click();
	await page.locator('select[name="resourceId"]').selectOption({ label: me });
	await page.locator('select[name="projectId"]').selectOption({ label: active });
	const today = ymd(new Date());
	await page.locator('input[name="startDate"]').fill(today);
	await page.locator('input[name="endDate"]').fill(today);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);

	// 今月・今日: 割り当てのある案件だけ
	await openSection(page, 'Projects');
	await expect(page.locator('tr', { hasText: active })).toBeVisible();
	await expect(page.locator('tr', { hasText: idle })).toHaveCount(0);
	await page.getByRole('combobox', { name: 'Period' }).selectOption({ label: 'Today' });
	await expect(page).toHaveURL(/period=today/);
	await expect(page.locator('tr', { hasText: active })).toBeVisible();

	// すべての期間: 割り当てのない案件も出る。 再読み込みしても保つ
	await page.getByRole('combobox', { name: 'Period' }).selectOption({ label: 'All periods' });
	await expect(page).toHaveURL(/period=all/);
	await page.reload();
	await expect(page.locator('tr', { hasText: idle })).toBeVisible();
	await expect(page.locator('tr', { hasText: idle })).toContainText(department);

	// 部署を消す。 確認ダイアログに案件の件数が出て、 消すと案件は未所属になる
	await openSection(page, 'Departments');
	// 部署名は他の行の「親部署」の選択肢にも出るので、 行見出しで行を特定する
	await page
		.getByRole('row')
		.filter({ has: page.getByRole('rowheader', { name: department, exact: true }) })
		.getByRole('button', { name: /^Delete$/ })
		.click();
	const alert = page.getByRole('alertdialog');
	await expect(alert).toContainText('Projects in this department: 2');
	await alert.getByRole('button', { name: /^Delete$/ }).click();
	await expect(page.getByRole('rowheader', { name: department })).toHaveCount(0);

	await page.goto('/projects?dept=__unassigned__&period=all');
	await expect(page.locator('tr', { hasText: active })).toContainText('Unassigned');
	await expect(page.locator('tr', { hasText: idle })).toContainText('Unassigned');

	// 後片付け: 案件を消す (割り当ても一緒に消える)
	for (const name of [active, idle]) {
		await page
			.locator('tr', { hasText: name })
			.getByRole('button', { name: /^Delete$/ })
			.click();
		await page
			.getByRole('alertdialog')
			.getByRole('button', { name: /^Delete$/ })
			.click();
		await expect(page.locator('tr', { hasText: name })).toHaveCount(0);
	}
});
