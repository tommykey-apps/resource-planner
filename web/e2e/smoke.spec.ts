import { expect, test } from '@playwright/test';

/**
 * 最小 smoke spec。Phase 3 (Auth.js + Magic Link) 完了後に sign-in / CRUD spec を追加する前の土台。
 *
 * 本テストは未認証アクセスの想定挙動 (sign-in リダイレクト or 認証画面表示) を確認するのみ。
 * 認証 fixture が必要な spec は PR-A3 以降で追加。
 */
test('home page responds (any 2xx/3xx) — minimal smoke', async ({ page }) => {
	const response = await page.goto('/');
	expect(response).not.toBeNull();
	const status = response!.status();
	expect(status).toBeLessThan(400);
});
