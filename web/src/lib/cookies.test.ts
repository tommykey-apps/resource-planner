import { describe, expect, it } from 'vitest';
import { buildClientCookie } from './cookies';

/**
 * #184: locale / theme の client-side cookie 書き込みを 1 helper に集約 +
 * production (HTTPS) で `Secure` 属性付与。 旧実装は protocol を問わず `Secure` 無しで、
 * MITM (HTTP downgrade) 経路で漏えいする risk があった。
 *
 * 属性順は document.cookie の SetCookie spec に倣う:
 *   <name>=<value>; path=/; max-age=<sec>; samesite=lax[; Secure]
 */
describe('buildClientCookie (#184)', () => {
	it('builds basic cookie string with name / value / path / max-age / samesite', () => {
		expect(buildClientCookie({ name: 'foo', value: 'bar', maxAge: 100, secure: false })).toBe(
			'foo=bar; path=/; max-age=100; samesite=lax'
		);
	});

	it('appends Secure attribute when secure=true', () => {
		expect(buildClientCookie({ name: 'foo', value: 'bar', maxAge: 100, secure: true })).toBe(
			'foo=bar; path=/; max-age=100; samesite=lax; Secure'
		);
	});

	it('uses the given max-age verbatim (1 year = 31536000)', () => {
		const c = buildClientCookie({
			name: 'locale',
			value: 'ja',
			maxAge: 31536000,
			secure: true
		});
		expect(c).toContain('max-age=31536000');
		expect(c).toMatch(/^locale=ja;/);
	});
});
