import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const isSuppressedMock = vi.fn();
vi.mock('$lib/repository/suppression', () => ({
	isSuppressed: (...args: unknown[]) => isSuppressedMock(...args)
}));

const { isDomainAllowed, sendMagicLinkDev, shouldAllowSignIn, fetchAuthSecret } =
	await import('./auth');

describe('isDomainAllowed', () => {
	it('returns true when email ends with @{allowed}', () => {
		expect(isDomainAllowed('alice@example.com', 'example.com')).toBe(true);
	});

	it('is case-insensitive on both sides', () => {
		expect(isDomainAllowed('Alice@Example.COM', 'example.com')).toBe(true);
		expect(isDomainAllowed('alice@example.com', 'EXAMPLE.COM')).toBe(true);
	});

	it('rejects different domain', () => {
		expect(isDomainAllowed('alice@other.com', 'example.com')).toBe(false);
	});

	it('rejects subdomain prefix when allowed is the bare domain', () => {
		// "evil.com" should not match "@example.com"
		expect(isDomainAllowed('alice@evil.com', 'example.com')).toBe(false);
	});

	it('rejects subdomain emails when allowed is bare domain (endsWith uses @ prefix)', () => {
		// `@example.com` で endsWith しているため、`@sub.example.com` は match しない。
		// セキュリティ的に望ましい (subdomain 経由の意図せぬ許可を防ぐ)。
		expect(isDomainAllowed('alice@sub.example.com', 'example.com')).toBe(false);
	});

	it('returns false when email is undefined', () => {
		expect(isDomainAllowed(undefined, 'example.com')).toBe(false);
	});

	it('returns false (fail-closed) when allowed is undefined', () => {
		expect(isDomainAllowed('alice@example.com', undefined)).toBe(false);
	});

	it('returns false when both are undefined', () => {
		expect(isDomainAllowed(undefined, undefined)).toBe(false);
	});

	it('returns false on email without @', () => {
		expect(isDomainAllowed('not-an-email', 'example.com')).toBe(false);
	});
});

/**
 * #113: Playwright fixture が magic link URL を取り出せるよう、dev sendVerificationRequest が
 * env.AUTH_TEST_MAGIC_LINK_FILE 指定時にファイルへ append することを保証する unit test。
 * Auth.js が token を hash 化して DDB に保存するため、URL の生成側でしか平文 token は触れない。
 */
describe('sendMagicLinkDev (#113)', () => {
	let originalEnvFile: string | undefined;
	let tmpFile: string;

	beforeEach(() => {
		originalEnvFile = process.env.AUTH_TEST_MAGIC_LINK_FILE;
		tmpFile = join(tmpdir(), `auth-magic-link-test-${Date.now()}-${Math.random()}.txt`);
	});

	afterEach(async () => {
		if (originalEnvFile === undefined) {
			delete process.env.AUTH_TEST_MAGIC_LINK_FILE;
		} else {
			process.env.AUTH_TEST_MAGIC_LINK_FILE = originalEnvFile;
		}
		await fs.unlink(tmpFile).catch(() => {});
	});

	it('appends "{email}\\t{url}\\n" to AUTH_TEST_MAGIC_LINK_FILE when set', async () => {
		process.env.AUTH_TEST_MAGIC_LINK_FILE = tmpFile;
		await sendMagicLinkDev({
			identifier: 'alice@example.com',
			url: 'http://localhost:4173/auth/callback/nodemailer?token=abc&email=alice%40example.com'
		});
		const content = await fs.readFile(tmpFile, 'utf-8');
		expect(content).toBe(
			'alice@example.com\thttp://localhost:4173/auth/callback/nodemailer?token=abc&email=alice%40example.com\n'
		);
	});

	it('appends a new line per call (multiple sign-in attempts)', async () => {
		process.env.AUTH_TEST_MAGIC_LINK_FILE = tmpFile;
		await sendMagicLinkDev({ identifier: 'a@example.com', url: 'http://x/1' });
		await sendMagicLinkDev({ identifier: 'b@example.com', url: 'http://x/2' });
		const content = await fs.readFile(tmpFile, 'utf-8');
		expect(content).toBe('a@example.com\thttp://x/1\nb@example.com\thttp://x/2\n');
	});

	it('does not touch the filesystem when AUTH_TEST_MAGIC_LINK_FILE is unset', async () => {
		delete process.env.AUTH_TEST_MAGIC_LINK_FILE;
		await sendMagicLinkDev({ identifier: 'alice@example.com', url: 'http://x/y' });
		await expect(fs.access(tmpFile)).rejects.toThrow();
	});
});

/**
 * #134: signIn callback の guard を純粋関数として抽出した shouldAllowSignIn。
 * domain check + suppression check の AND が正しく合成されることを確認する。
 */
describe('shouldAllowSignIn (#134)', () => {
	beforeEach(() => {
		isSuppressedMock.mockReset().mockResolvedValue(false);
	});

	it('domain 拒否 → false (suppression は確認すらしない、 早期 reject)', async () => {
		const r = await shouldAllowSignIn('alice@evil.com', 'example.com');
		expect(r).toBe(false);
		expect(isSuppressedMock).not.toHaveBeenCalled();
	});

	it('domain 許可 + suppression hit → false', async () => {
		isSuppressedMock.mockResolvedValueOnce(true);
		expect(await shouldAllowSignIn('alice@example.com', 'example.com')).toBe(false);
		expect(isSuppressedMock).toHaveBeenCalledWith('alice@example.com');
	});

	it('domain 許可 + suppression 無し → true', async () => {
		isSuppressedMock.mockResolvedValueOnce(false);
		expect(await shouldAllowSignIn('alice@example.com', 'example.com')).toBe(true);
	});

	it('email undefined → false (suppression check しない)', async () => {
		expect(await shouldAllowSignIn(undefined, 'example.com')).toBe(false);
		expect(isSuppressedMock).not.toHaveBeenCalled();
	});

	it('allowed undefined → false (fail-closed)', async () => {
		expect(await shouldAllowSignIn('alice@example.com', undefined)).toBe(false);
		expect(isSuppressedMock).not.toHaveBeenCalled();
	});
});

/**
 * #168: Lambda Parameters and Secrets Extension 経由で AUTH_SECRET を取得する pure helper。
 *
 * AWS 公式 docs (https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html)
 * の Recommended Pattern に従う:
 *   - GET http://localhost:2773/systemsmanager/parameters/get?name={encoded}&withDecryption=true
 *   - Header: X-Aws-Parameters-Secrets-Token = $AWS_SESSION_TOKEN
 *   - Response: { Parameter: { Value: "..." } }
 *
 * Extension は **INVOKE phase でのみ** 利用可能 (INIT phase では起動していない) ため、
 * fetcher は handler 内 (= SvelteKitAuth function-form) で呼ぶ前提。
 */
describe('fetchAuthSecret (#168 Lambda Extension)', () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('returns AUTH_SECRET directly without calling fetch when set', async () => {
		const fetchSpy = vi.fn();
		globalThis.fetch = fetchSpy as unknown as typeof fetch;
		const secret = await fetchAuthSecret({
			authSecret: 'dev-secret',
			authSecretParam: '/some/param',
			sessionToken: 'tok'
		});
		expect(secret).toBe('dev-secret');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('throws when neither AUTH_SECRET nor AUTH_SECRET_PARAM is set (fail-closed)', async () => {
		await expect(
			fetchAuthSecret({
				authSecret: undefined,
				authSecretParam: undefined,
				sessionToken: 'tok'
			})
		).rejects.toThrow(/AUTH_SECRET/);
	});

	it('throws when AUTH_SECRET_PARAM is set but AWS_SESSION_TOKEN is missing', async () => {
		await expect(
			fetchAuthSecret({
				authSecret: undefined,
				authSecretParam: '/resource-planner/auth-secret',
				sessionToken: undefined
			})
		).rejects.toThrow(/AWS_SESSION_TOKEN/);
	});

	it('calls localhost:2773 with X-Aws-Parameters-Secrets-Token header and withDecryption=true', async () => {
		const fetchSpy = vi.fn<typeof fetch>(
			async () =>
				new Response(JSON.stringify({ Parameter: { Value: 'real-secret' } }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
		);
		globalThis.fetch = fetchSpy;
		const secret = await fetchAuthSecret({
			authSecret: undefined,
			authSecretParam: '/resource-planner/auth-secret',
			sessionToken: 'session-token-abc'
		});
		expect(secret).toBe('real-secret');
		expect(fetchSpy).toHaveBeenCalledOnce();
		const [url, init] = fetchSpy.mock.calls[0];
		expect(String(url)).toBe(
			'http://localhost:2773/systemsmanager/parameters/get?name=%2Fresource-planner%2Fauth-secret&withDecryption=true'
		);
		const headers = (init?.headers ?? {}) as Record<string, string>;
		expect(headers['X-Aws-Parameters-Secrets-Token']).toBe('session-token-abc');
	});

	it('URL-encodes parameter names with slashes / special characters', async () => {
		const fetchSpy = vi.fn<typeof fetch>(
			async () => new Response(JSON.stringify({ Parameter: { Value: 'x' } }), { status: 200 })
		);
		globalThis.fetch = fetchSpy;
		await fetchAuthSecret({
			authSecret: undefined,
			authSecretParam: '/dev/prod/East/Project-ABC/MyParameter',
			sessionToken: 't'
		});
		const [url] = fetchSpy.mock.calls[0];
		expect(String(url)).toContain(encodeURIComponent('/dev/prod/East/Project-ABC/MyParameter'));
	});

	it('throws with status on non-2xx response', async () => {
		const fetchSpy = vi.fn(async () => new Response('forbidden', { status: 403 }));
		globalThis.fetch = fetchSpy as unknown as typeof fetch;
		await expect(
			fetchAuthSecret({
				authSecret: undefined,
				authSecretParam: '/p',
				sessionToken: 't'
			})
		).rejects.toThrow(/403/);
	});

	it('throws when response body lacks Parameter.Value', async () => {
		const fetchSpy = vi.fn(
			async () => new Response(JSON.stringify({ Parameter: {} }), { status: 200 })
		);
		globalThis.fetch = fetchSpy as unknown as typeof fetch;
		await expect(
			fetchAuthSecret({
				authSecret: undefined,
				authSecretParam: '/p',
				sessionToken: 't'
			})
		).rejects.toThrow(/Parameter\.Value/);
	});
});
