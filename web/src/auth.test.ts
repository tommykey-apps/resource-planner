import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDomainAllowed, sendMagicLinkDev } from './auth';

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
