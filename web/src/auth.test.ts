import { describe, expect, it } from 'vitest';
import { isDomainAllowed } from './auth';

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
