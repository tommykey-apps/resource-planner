/**
 * dist/web-function を Lambda Web Functions と同じ Node の起動オプションで立ち上げ、
 * 画面が返るかを確かめる (CI の build-web で実行)。
 *
 * Lambda の Node は CommonJS から ES モジュールを require できない (--no-experimental-require-module)。
 * 依存の更新でそういうパッケージが入ると全ページが 500 になるため、本番に出る前にここで止める。
 * 起動オプションは nodejs24.x の Web Function で process.execArgv を出力して確かめた値。
 * Refs:
 * - https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html (Experimental Node.js features)
 * - https://docs.aws.amazon.com/lambda/latest/dg/web-functions-runtimes.html
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/web-function');
const LAMBDA_NODE_FLAGS = [
	'--expose-gc',
	'--max-http-header-size',
	'135168',
	'--no-experimental-require-module',
	'--no-experimental-detect-module',
	'--max-semi-space-size=102',
	'--max-old-space-size=1024'
];
const ADDRESS = '127.0.0.1:18080';
const BASE = `http://${ADDRESS}`;
const STARTUP_LIMIT_MS = 10_000; // Web Functions は起動から 10 秒以内に待ち受けを始める必要がある

const server = spawn(process.execPath, [...LAMBDA_NODE_FLAGS, 'index.js'], {
	cwd: PACKAGE_DIR,
	env: {
		PATH: process.env.PATH,
		AWS_LAMBDA_HTTP_ENDPOINT: ADDRESS,
		AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs24.x-lambda-web',
		AWS_LAMBDA_METADATA_TOKEN: 'smoke',
		AWS_REGION: 'ap-northeast-1',
		AWS_ACCESS_KEY_ID: 'smoke',
		AWS_SECRET_ACCESS_KEY: 'smoke',
		NODE_PATH: PACKAGE_DIR,
		ORIGIN: BASE,
		AUTH_SECRET: 'smoke-secret-not-for-production-padding',
		AUTH_TRUST_HOST: 'true',
		DYNAMODB_TABLE: 'smoke',
		ALLOWED_DOMAIN: 'example.com',
		EMAIL_FROM: 'noreply@example.com'
	},
	stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
server.stdout.on('data', (d) => (output += d));
server.stderr.on('data', (d) => (output += d));

async function waitForListening() {
	const deadline = Date.now() + STARTUP_LIMIT_MS;
	while (Date.now() < deadline) {
		try {
			await fetch(`${BASE}/_app/version.json`);
			return;
		} catch {
			await sleep(200);
		}
	}
	throw new Error(`did not start listening within ${STARTUP_LIMIT_MS} ms`);
}

// 未ログインで見られる画面と、ログイン画面へ転送される画面。どちらも jsdom などサーバー側の依存を読み込む
const checks = [
	{ path: '/sign-in', status: 200 },
	{ path: '/', status: 303 },
	{ path: '/_app/version.json', status: 200 }
];

let failed = false;
try {
	await waitForListening();
	for (const { path, status } of checks) {
		const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
		const ok = res.status === status;
		console.log(`${ok ? 'ok  ' : 'FAIL'} ${path} -> ${res.status} (expected ${status})`);
		failed ||= !ok;
	}
} catch (e) {
	console.error(e);
	failed = true;
} finally {
	server.kill('SIGTERM');
}

if (failed) {
	console.error('--- server output ---\n' + output);
	process.exit(1);
}
