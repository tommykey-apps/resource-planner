import { expect, test } from '@playwright/test';

/**
 * PR-N0: CSP header (kit.csp 単一統合) の regression test。
 *
 * 設計判断:
 * - `svelte.config.js` の `kit.csp` 単一で全 directive を出す (hooks.server.ts では touch しない)
 * - `mode: 'auto'` で SSR page に nonce を SvelteKit が自動付与
 * - `style-src 'unsafe-inline'` は Svelte transition / Tailwind 都合で当面残す (nonce 化は別 issue)
 *
 * OWASP CSP Cheat Sheet baseline:
 * - https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
 * - `default-src 'self'` / `object-src 'none'` / `base-uri 'self'` / `form-action 'self'` / `frame-ancestors 'none'` を必須
 *
 * Playwright response header は **lowercase normalize** される ([Playwright docs](https://playwright.dev/docs/api/class-response#response-headers))。
 */

test('CSP header includes OWASP baseline directives on SSR page (sign-in)', async ({ page }) => {
	const response = await page.goto('/sign-in');
	expect(response).not.toBeNull();
	const csp = response!.headers()['content-security-policy'];
	expect(csp).toBeTruthy();

	expect(csp).toContain("default-src 'self'");
	expect(csp).toContain("object-src 'none'");
	expect(csp).toContain("base-uri 'self'");
	expect(csp).toContain("form-action 'self'");
	expect(csp).toContain("frame-ancestors 'none'");
	// SvelteKit kit.csp.mode='auto' が SSR で自動付与する nonce
	expect(csp).toMatch(/script-src[^;]*'nonce-/);
});

test('CSP excludes unsafe-eval', async ({ page }) => {
	const response = await page.goto('/sign-in');
	const csp = response!.headers()['content-security-policy'] ?? '';
	expect(csp).not.toContain("'unsafe-eval'");
});

test('CSP includes style-src unsafe-inline (Svelte transition / Tailwind 都合、 将来 nonce 化)', async ({
	page
}) => {
	const response = await page.goto('/sign-in');
	const csp = response!.headers()['content-security-policy'] ?? '';
	expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
});

test('Other security headers (X-Content-Type-Options / Referrer-Policy / Permissions-Policy)', async ({
	page
}) => {
	const response = await page.goto('/sign-in');
	const headers = response!.headers();
	// hooks.server.ts の securityHeadersHandle で set
	expect(headers['x-content-type-options']).toBe('nosniff');
	expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
	expect(headers['permissions-policy']).toContain('camera=()');
});
