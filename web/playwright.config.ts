import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Playwright E2E test configuration.
 *
 * **位置づけ**: Auth.js 移行後 (PR-A3 以降) に Magic Link sign-in → CRUD のフルパス E2E を書く土台。
 *
 * - 既定では preview build (`pnpm build && pnpm preview`) を Playwright が起動
 * - CI は Chromium のみ (コスト削減)、ローカルは 3 ブラウザ並行
 *
 * **env 注入** (#125): `vite preview` は SvelteKit 統合と違って `.env.local` を process.env に
 * 注入しない。host shell に本番 AWS credential が残っていると preview server が本番 DynamoDB に
 * 到達して書き込み事故になる (実発生済)。`webServer.env` で AWS / AUTH 系を明示上書きし、
 * `assertSafeDbEnv` (#125 アプリ guard) と合わせて二重防御。
 *
 * Playwright の `webServer.env`:
 *   - 未設定 → spawn 時に process.env を継承
 *   - 設定 → そのオブジェクトで完全置換 (継承しない)
 *
 * よって `...process.env` を最初に展開して PATH 等を流し、AWS 系は後から明示で上書きする
 * (object spread 後勝ち)。
 */

// fixture (test runner プロセス) と webServer 両方が同じファイルを読み書きするため、
// この config 評価時に env で固定し、両プロセスが同じ path を見るようにする。
const magicLinkFile = join(tmpdir(), 'playwright-magic-links.txt');
process.env.AUTH_TEST_MAGIC_LINK_FILE ??= magicLinkFile;

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
		timeout: 120_000,
		env: {
			// host env (PATH / HOME 等) を継承 → AWS 系は後で明示上書きする
			...process.env,
			// ローカル DDB に固定 (host shell に本番 cred があっても無視される + アプリ側 guard も通る)
			AWS_ENDPOINT_URL: 'http://localhost:8000',
			AWS_ACCESS_KEY_ID: 'local',
			AWS_SECRET_ACCESS_KEY: 'local',
			AWS_REGION: 'ap-northeast-1',
			AWS_DEFAULT_REGION: 'ap-northeast-1',
			DYNAMODB_TABLE: 'resource-planner',
			AUTH_SECRET: 'e2e-secret-not-for-production-padding-padding-padding',
			AUTH_TRUST_HOST: 'true',
			ALLOWED_DOMAIN: 'example.com',
			EMAIL_FROM: 'noreply@example.com',
			AUTH_TEST_MAGIC_LINK_FILE: process.env.AUTH_TEST_MAGIC_LINK_FILE ?? magicLinkFile
		}
	}
});
