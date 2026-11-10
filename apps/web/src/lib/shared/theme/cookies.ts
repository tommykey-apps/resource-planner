/**
 * Client-side cookie 書き込み用 pure helper (#184)。
 *
 * 旧: locale / theme で `document.cookie = "${name}=${value}; path=/; max-age=...; samesite=lax"`
 * を 2 箇所コピペ + production でも `Secure` 属性なし → HTTP downgrade MITM 経路で漏えい risk。
 *
 * 本 helper で:
 * - 属性順を 1 箇所に集約 (path / max-age / samesite / Secure)
 * - `secure` flag を呼び出し側で渡せるようにして、 production (HTTPS) では `Secure` 付与
 * - 純粋関数で test 容易
 *
 * 呼び出し側は `window.location.protocol === 'https:'` 等で secure 判定する。
 */

export interface ClientCookieInput {
	name: string;
	value: string;
	/** max-age 秒数 (e.g. 1 year = 31536000)。 */
	maxAge: number;
	/** true なら `Secure` 属性を付ける (production HTTPS 用)。 dev (http://localhost) では false。 */
	secure: boolean;
}

export function buildClientCookie(input: ClientCookieInput): string {
	const parts = [
		`${input.name}=${input.value}`,
		'path=/',
		`max-age=${input.maxAge}`,
		'samesite=lax'
	];
	if (input.secure) parts.push('Secure');
	return parts.join('; ');
}

/**
 * Client (browser) 環境で「secure context (HTTPS)」 か判定。
 * SSR / 非 browser 環境では false (cookie 書き込み自体が起きないため値はどちらでも安全)。
 */
export function isSecureClientContext(): boolean {
	return typeof window !== 'undefined' && window.location?.protocol === 'https:';
}
