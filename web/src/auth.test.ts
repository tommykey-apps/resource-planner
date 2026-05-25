import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const isSuppressedMock = vi.fn();
vi.mock('$lib/repository/suppression', () => ({
	isSuppressed: (...args: unknown[]) => isSuppressedMock(...args)
}));

const { isDomainAllowed, makeAuthSecretResolver, sendMagicLinkDev, shouldAllowSignIn } =
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
 * #168: top-level await SSM を撤去し、 lazy memoize に切替えた resolver の単体検証。
 * - 構築時に副作用 (SSM call) が走らないこと → module load = SSM 障害耐性
 * - 初回 resolve で fetcher 1 回呼び出し、 2 回目以降は cache hit
 * - 失敗時は cache が clear されて次回 retry できる (transient SSM 障害からの回復)
 */
describe('makeAuthSecretResolver (#168)', () => {
	it('AUTH_SECRET が set されていれば fetcher を呼ばずに即返す', async () => {
		const fetcher = vi.fn();
		const resolve = makeAuthSecretResolver({
			authSecret: 'env-secret',
			authSecretParam: undefined,
			fetcher
		});
		expect(await resolve()).toBe('env-secret');
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('AUTH_SECRET + AUTH_SECRET_PARAM 両方 set なら env が勝つ', async () => {
		const fetcher = vi.fn();
		const resolve = makeAuthSecretResolver({
			authSecret: 'env-secret',
			authSecretParam: '/my/param',
			fetcher
		});
		expect(await resolve()).toBe('env-secret');
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('AUTH_SECRET なし + AUTH_SECRET_PARAM あり → SSM fetcher 呼び出し', async () => {
		const fetcher = vi.fn().mockResolvedValue('ssm-secret');
		const resolve = makeAuthSecretResolver({
			authSecret: undefined,
			authSecretParam: '/my/param',
			fetcher
		});
		expect(await resolve()).toBe('ssm-secret');
		expect(fetcher).toHaveBeenCalledWith('/my/param');
	});

	it('memoize: 同じ resolver を 2 回呼んでも fetcher 1 回だけ', async () => {
		const fetcher = vi.fn().mockResolvedValue('ssm-secret');
		const resolve = makeAuthSecretResolver({
			authSecret: undefined,
			authSecretParam: '/my/param',
			fetcher
		});
		await resolve();
		await resolve();
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('fetcher 失敗時は cache を clear して次回 retry できる', async () => {
		const fetcher = vi
			.fn()
			.mockRejectedValueOnce(new Error('SSM blip'))
			.mockResolvedValueOnce('ssm-secret');
		const resolve = makeAuthSecretResolver({
			authSecret: undefined,
			authSecretParam: '/my/param',
			fetcher
		});
		await expect(resolve()).rejects.toThrow('SSM blip');
		expect(await resolve()).toBe('ssm-secret');
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('AUTH_SECRET も AUTH_SECRET_PARAM も無い場合は resolve 時に throw', async () => {
		const resolve = makeAuthSecretResolver({
			authSecret: undefined,
			authSecretParam: undefined
		});
		await expect(resolve()).rejects.toThrow(/Neither AUTH_SECRET nor AUTH_SECRET_PARAM/);
	});

	it('構築時には fetcher を呼ばない (lazy)', () => {
		const fetcher = vi.fn();
		makeAuthSecretResolver({
			authSecret: undefined,
			authSecretParam: '/my/param',
			fetcher
		});
		expect(fetcher).not.toHaveBeenCalled();
	});
});
