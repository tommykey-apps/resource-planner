import { expect, test, type Page } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';

/**
 * E2E for Project detail modal (PR-N5, refs #187)。
 *
 * PR-N1〜N4 で構築した data layer + form + SSR markdown render + ProjectDetailView の
 * **境界の繋ぎ** を 1 spec で固定する。
 * 個々の component / schema / repository / load は unit / integration で担保済。
 * ここでは:
 *   - form 経由で description / tags / links を save → reload で値復元
 *   - assignments page で project click → modal で sanitize 済 markdown が見える
 *   - XSS attack vector が server side で strip され、 client に到達しないこと
 *   - 外部 link の WCAG / OWASP a11y 属性 (target / rel / sr-only)
 *   - REMOVE semantics: detail を空にしたら DDB attribute が消える (= reload で見えない)
 */

test.describe.configure({ mode: 'serial' });

test.beforeEach(async () => {
	await clearMagicLinks();
});

async function signInAsTestUser(page: Page): Promise<void> {
	await page.goto('/sign-in');
	await page.fill('input[name="email"]', 'allowed@example.com');
	await page.click('button[type="submit"]');
	await expect(page).toHaveURL(/\/sign-in\/check-email/);
	const url = await getMagicLinkUrl('allowed@example.com');
	await page.goto(url);
	await expect(page).toHaveURL(/^http:\/\/localhost:4173\/(\?|$)/);
}

async function createResource(page: Page, name: string): Promise<void> {
	await page.getByRole('button', { name: /Manage people/ }).click();
	await page.getByRole('button', { name: /\+ Add person/ }).click();
	await page.getByLabel('Name').fill(name);
	await page.getByRole('button', { name: /^Create$/ }).click();
	await expect(page.locator('li', { hasText: name })).toBeVisible();
	await page.keyboard.press('Escape');
}

async function openProjectForm(page: Page): Promise<void> {
	await page.getByRole('button', { name: /Manage projects/ }).click();
	await page.getByRole('button', { name: /\+ Add project/ }).click();
}

async function fillProjectDetail(
	page: Page,
	options: { description?: string; tags?: string; links?: { label?: string; url: string }[] }
): Promise<void> {
	// 詳細 section を expand (新規 project では default closed)。 既存値ありなら open なので
	// 二重 click を避けるため `[open]` 属性で判定。
	const details = page.locator('details').filter({ hasText: 'Edit detail' });
	const isOpen = (await details.getAttribute('open')) !== null;
	if (!isOpen) {
		await details.locator('summary').click();
	}
	// textarea が visible になるまで wait (details の display 切替の reactivity を吸収)
	await expect(page.locator('textarea[name="description"]')).toBeVisible();

	if (options.description !== undefined) {
		await page.locator('textarea[name="description"]').fill(options.description);
	}
	if (options.tags !== undefined) {
		await page.locator('input[name="tags"]').fill(options.tags);
	}
	if (options.links) {
		for (const [i, link] of options.links.entries()) {
			await page.getByRole('button', { name: /\+ Add link/ }).click();
			if (link.label !== undefined) {
				// row index ベースで input を絞る (aria-label に行番号付き、 WCAG 2.5.3)
				await page.getByLabel(new RegExp(`Label \\(optional\\) ${i + 1}`)).fill(link.label);
			}
			await page.getByLabel(new RegExp(`^URL ${i + 1}$`)).fill(link.url);
		}
	}
}

async function submitProjectForm(page: Page, action: 'create' | 'update'): Promise<void> {
	const label = action === 'create' ? /^Create$/ : /^Update$/;
	await page.getByRole('button', { name: label }).click();
}

async function createAssignment(
	page: Page,
	opts: { projectName: string; resourceName: string }
): Promise<void> {
	// AssignmentCreator の trigger button (Plus icon + "Add assignment" text、 #142 mobile では icon のみ表示)
	await page.getByRole('button', { name: /Add assignment/ }).first().click();
	await page.locator('select[name="resourceId"]').selectOption({ label: opts.resourceName });
	await page.locator('select[name="projectId"]').selectOption({ label: opts.projectName });
	const today = new Date().toISOString().slice(0, 10);
	const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
	await page.locator('input[name="startDate"]').fill(today);
	await page.locator('input[name="endDate"]').fill(tomorrow);
	await page.getByRole('button', { name: /^Create$/ }).click();
}

test('Project detail: form CRUD で description/tags/links を save → reload で値復元 + REMOVE で消える (refs #187)', async ({
	page
}) => {
	await signInAsTestUser(page);

	const projectName = `e2e-detail-crud-${Date.now()}`;

	// ── create with full detail
	await openProjectForm(page);
	await page.getByLabel('Project name').fill(projectName);
	await fillProjectDetail(page, {
		description: '## Tech\n\n- **TypeScript**\n- AWS Lambda',
		tags: 'TypeScript, AWS',
		links: [{ label: 'Wiki', url: 'https://example.com/wiki' }]
	});
	await submitProjectForm(page, 'create');
	await expect(page.locator('li', { hasText: projectName })).toBeVisible();

	// ── reload: ProjectManager → Edit で値復元
	await page.reload();
	await page.getByRole('button', { name: /Manage projects/ }).click();
	await page
		.locator('li', { hasText: projectName })
		.getByRole('button', { name: /^Edit$/ })
		.click();
	// detail section は値あるので default open
	await expect(page.locator('textarea[name="description"]')).toHaveValue(/TypeScript/);
	await expect(page.locator('input[name="tags"]')).toHaveValue(/TypeScript,\s*AWS/);
	const linksJson = await page.locator('input[type="hidden"][name="linksJson"]').inputValue();
	expect(JSON.parse(linksJson)).toEqual([{ label: 'Wiki', url: 'https://example.com/wiki' }]);

	// ── update: 全 detail を空にする → REMOVE semantics
	await page.locator('textarea[name="description"]').fill('');
	await page.locator('input[name="tags"]').fill('');
	// link は remove button 押下
	await page
		.getByRole('button', { name: /^Remove 1$/ })
		.click();
	await submitProjectForm(page, 'update');

	// ── reload で再確認 → 全部空
	await page.reload();
	await page.getByRole('button', { name: /Manage projects/ }).click();
	await page
		.locator('li', { hasText: projectName })
		.getByRole('button', { name: /^Edit$/ })
		.click();
	// detail なしなので default closed → expand
	await page.locator('details > summary', { hasText: /Edit detail/ }).click();
	await expect(page.locator('textarea[name="description"]')).toHaveValue('');
	await expect(page.locator('input[name="tags"]')).toHaveValue('');
	const linksJsonAfter = await page
		.locator('input[type="hidden"][name="linksJson"]')
		.inputValue();
	expect(JSON.parse(linksJsonAfter)).toEqual([]);
});

test('Project detail modal: assignments page で project click → markdown が render され XSS 試験ベクトルが strip される (refs #187)', async ({
	page
}) => {
	// dialog listener を貼って alert 検出 (BP B12)
	let dialogTriggered = false;
	page.on('dialog', async (d) => {
		dialogTriggered = true;
		await d.dismiss();
	});

	await signInAsTestUser(page);

	const resourceName = `e2e-md-r-${Date.now()}`;
	const projectName = `e2e-md-p-${Date.now()}`;
	await createResource(page, resourceName);

	// ── XSS 試験ベクトル + 正常 markdown を含む description
	await openProjectForm(page);
	await page.getByLabel('Project name').fill(projectName);
	await fillProjectDetail(page, {
		description:
			'**bold** *italic* [link](https://example.com)\n\n<script>alert(1)</script><img src=x onerror=alert(2)>',
		tags: 'SvelteKit, Zod',
		links: [{ label: 'Spec', url: 'https://example.com/spec' }]
	});
	await submitProjectForm(page, 'create');
	// form modal が success で auto-close するのを待ってから manage modal を Escape で閉じる
	// (form modal の閉じる animation 中に Escape を送ると form 側で吸収されて manage が残る)
	await expect(page.getByRole('dialog', { name: /Add project/i })).toBeHidden();
	await page.keyboard.press('Escape');
	await expect(page.locator('[data-dialog-overlay][data-state="open"]')).toHaveCount(0);

	// ── Assignment 作成 (project が /assignments に出てくる前提)
	await createAssignment(page, { projectName, resourceName });

	// ── /assignments に navigate (Playwright 公式は networkidle 非推奨、 web assertion で待つ)
	await page.goto('/assignments');
	const projectButton = page.getByRole('button', { name: projectName }).first();
	await expect(projectButton).toBeVisible();

	// project 名 button click → modal open
	await projectButton.click();

	const modal = page.getByRole('dialog');
	await expect(modal).toBeVisible();

	// ── markdown が rendered HTML として見える (server-side sanitize 済)
	await expect(modal.locator('.prose strong')).toContainText('bold');
	await expect(modal.locator('.prose em')).toContainText('italic');
	await expect(modal.locator('.prose a[href="https://example.com"]')).toContainText('link');

	// ── XSS attack vector は DOM 構造として strip 済 (ADR 0010 / PR-N2 防御、
	//     innerHTML 文字列 grep ではなく locator で 「要素自体が無い」 を assert)
	await expect(modal.locator('script')).toHaveCount(0);
	await expect(modal.locator('img')).toHaveCount(0);
	await expect(modal.locator('[onerror]')).toHaveCount(0);

	// alert dialog は同期発火 (DOMPurify が sanitize 段階で <script>/<img> を除去するため
	//   そもそも attack vector が DOM に到達しない)、 hard wait 不要
	expect(dialogTriggered).toBe(false);

	// ── tags / links section
	const tagItems = await modal.locator('ul li', { hasText: /SvelteKit/ }).count();
	expect(tagItems).toBeGreaterThanOrEqual(1);

	const externalLink = modal.locator('a[href="https://example.com/spec"]');
	await expect(externalLink).toHaveAttribute('target', '_blank');
	await expect(externalLink).toHaveAttribute('rel', 'noopener noreferrer');
	// BP B7 sr-only: 「新規 tab で開く」 / "opens in new tab"
	await expect(externalLink.locator('.sr-only')).toContainText(/(新規 tab|new tab)/i);
});
