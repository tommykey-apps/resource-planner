import { expect, test } from '@playwright/test';
import { clearMagicLinks, getMagicLinkUrl } from './fixtures/magic-link';

/**
 * #166: AvatarDropdown sign-out が Auth.js v5 で MissingCSRF を出していた regression guard。
 *
 * sign-in は別 spec で同じ magic-link fixture を使う serial 構成なので、 こちらも
 * test 間で session を共有しないよう serial にする。 home 着地までは sign-in.spec.ts と
 * 同型 (allowed@example.com / ALLOWED_DOMAIN=example.com / playwright.config.ts:66 参照)。
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async () => {
	await clearMagicLinks();
});

test('Avatar → サインアウト → /sign-in 着地 + session cookie 削除 (#166)', async ({ page }) => {
	// 1) magic link sign-in で home 着地
	await page.goto('/sign-in');
	await page.fill('input[name="email"]', 'allowed@example.com');
	await page.click('button[type="submit"]');
	await expect(page).toHaveURL(/\/sign-in\/check-email/);

	const url = await getMagicLinkUrl('allowed@example.com');
	await page.goto(url);
	await expect(page).toHaveURL(/^http:\/\/localhost:4173\/(\?|$)/);

	// 2) avatar trigger を開いてサインアウト button を click
	// AppHeader 右端の AvatarDropdown.Trigger は aria-label に email を含む。
	const avatarTrigger = page.getByRole('button', { name: /allowed@example.com/i });
	await expect(avatarTrigger).toBeVisible();
	await avatarTrigger.click();

	// DropdownMenu は Portal で body 直挿入。 SignOutForm の submit button は
	// locale で文言が変わる (ja: サインアウト / en: Sign out)。 e2e は browser locale から
	// en になりがちなので locale-agnostic regex。
	const signOutBtn = page.getByRole('button', { name: /サインアウト|sign out/i });
	await expect(signOutBtn).toBeVisible();
	await signOutBtn.click();

	// 3) /sign-in へ着地 (callbackUrl="/sign-in" + layout の未認証 guard と合流)
	await expect(page).toHaveURL(/\/sign-in($|\?)/);

	// 4) session cookie が消えていること (Auth.js は session cookie を空 + expire セット)。
	// cookie が完全削除 or expire 済 (Max-Age=0) のどちらでも有効として扱う。
	const cookies = await page.context().cookies();
	const sessionCookie = cookies.find((c) => /session-token/.test(c.name));
	if (sessionCookie) {
		expect(sessionCookie.value).toBe('');
	}

	// 5) 再度 home に飛ぶと /sign-in へ redirect される (layout guard が動いていること)
	await page.goto('/');
	await expect(page).toHaveURL(/\/sign-in($|\?)/);
});
