import { expect, type Page } from '@playwright/test';

/**
 * E2E fixture: ヘッダーの水平メニュー (グローバルナビ) から上位区画へ移動する。
 * desktop viewport (md 以上) 前提。 EN locale (CI default の Accept-Language) のラベルで探す。
 */
const SECTION_PATHS = {
	Timeline: '/',
	Assignments: '/assignments',
	People: '/resources',
	Projects: '/projects',
	Departments: '/departments'
} as const;

export async function openSection(page: Page, name: keyof typeof SECTION_PATHS): Promise<void> {
	await page
		.getByRole('navigation', { name: 'Main menu' })
		.getByRole('link', { name, exact: true })
		.click();
	await expect(page).toHaveURL(new RegExp(`^http://localhost:4173${SECTION_PATHS[name]}(\\?|$)`));
}
