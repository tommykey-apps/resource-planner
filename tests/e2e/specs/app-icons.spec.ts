import { expect, test } from '@playwright/test';

/**
 * タブのアイコン・Apple 用アイコン・favicon.ico を、 ビルドしたアプリが正しく配ることを確かめる。
 *
 * - SVG と Apple 用アイコンは中身のハッシュ値入りの URL (図を変えると URL も変わる)
 * - favicon.ico は RSS リーダーなど /favicon.ico しか見ない道具のため固定の URL に置く
 * Refs: https://svelte.dev/docs/kit/project-structure#Project-files-static
 * Refs: https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs
 */

test('タブのアイコンはハッシュ値入りの URL の SVG で、 取得できる', async ({ page, request }) => {
	await page.goto('/sign-in');
	const href = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute('href');
	expect(href).toMatch(/\/_app\/immutable\/assets\/icon\.[\w-]+\.svg$/);

	const res = await request.get(href!);
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toContain('image/svg+xml');
});

test('Apple 用アイコンはハッシュ値入りの URL の PNG で、 取得できる', async ({ page, request }) => {
	await page.goto('/sign-in');
	const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
	expect(href).toMatch(/\/_app\/immutable\/assets\/apple-touch-icon\.[\w-]+\.png$/);

	const res = await request.get(href!);
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toContain('image/png');
});

test('/favicon.ico は固定の URL で取得でき、 ブラウザが画像として読める', async ({
	page,
	request
}) => {
	const res = await request.get('/favicon.ico', { maxRedirects: 0 });
	expect(res.status()).toBe(200);
	// ICO の先頭 4 バイト (予約 0、 種類 1 = アイコン)。
	// adapter-node の配信 (sirv が使う mrmime 2.0.1) は ico の Content-Type を持たず空で返す。
	// 画像は中身から形式を判定される (MIME Sniffing) ので、 ブラウザで読めることも確かめる。
	expect([...(await res.body()).subarray(0, 4)]).toEqual([0, 0, 1, 0]);

	await page.goto('/sign-in');
	const width = await page.evaluate(async () => {
		const img = new Image();
		img.src = '/favicon.ico';
		await img.decode();
		return img.naturalWidth;
	});
	expect(width).toBe(32);
});

test('manifest は出さない', async ({ page }) => {
	await page.goto('/sign-in');
	await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
});
