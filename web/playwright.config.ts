import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Playwright E2E test configuration.
 *
 * **位置づけ**: Auth.js 移行後 (PR-A3 以降) に Magic Link sign-in → CRUD のフルパス E2E を書く土台。
 * 本 PR (PR-T5) ではホーム画面の smoke、#113 で Magic Link sign-in spec を追加。
 *
 * - 既定では preview build (`pnpm build && pnpm preview`) を Playwright が起動
 * - CI は Chromium のみ (コスト削減)、ローカルは 3 ブラウザ並行
 * - dev sendVerificationRequest が URL を書き出す `AUTH_TEST_MAGIC_LINK_FILE` を preview server に
 *   渡すため、ここで process.env に注入する (webServer.env は process.env を引き継がない仕様のため)。
 */
process.env.AUTH_TEST_MAGIC_LINK_FILE ??= join(tmpdir(), 'playwright-magic-links.txt');

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry'
	},
	projects: process.env.CI
		? [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
		: [
				{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
				{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
				{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
			],
	webServer: {
		command: 'pnpm preview --host 127.0.0.1 --port 4173',
		url: 'http://localhost:4173',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
