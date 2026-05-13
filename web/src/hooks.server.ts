import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { handle as authjsHandle } from './auth';
import { COOKIE_NAME, pickLocaleFromAcceptLanguage, type Locale } from '$lib/i18n/index.svelte';
import { pickTheme, THEME_COOKIE_NAME } from '$lib/theme';

/**
 * locale を cookie / Accept-Language から決定して event.locals に格納する hook (#98)。
 * 優先順位: cookie > Accept-Language > 'en' (fallback)。
 *
 * 実値は `+layout.server.ts` で `data.locale` として client に渡る。
 */
const localeHandle: Handle = async ({ event, resolve }) => {
	const cookieLocale = event.cookies.get(COOKIE_NAME);
	let locale: Locale;
	if (cookieLocale === 'en' || cookieLocale === 'ja') {
		locale = cookieLocale;
	} else {
		locale = pickLocaleFromAcceptLanguage(event.request.headers.get('accept-language'));
	}
	event.locals.locale = locale;
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('<html lang="en">', `<html lang="${locale}">`)
	});
};

/**
 * theme (light/dark/system) を cookie から決定して event.locals に格納する hook (#141)。
 * cookie 名は mode-watcher の localStorage key (`mode-watcher-mode`) と揃える。
 * cookie 無し → 'system' (mode-watcher 既定と一致)。
 *
 * SSR で `+layout.server.ts` 経由 `<ModeWatcher defaultMode={data.theme} />` に渡し、
 * client hydration 時の userPrefersMode 初期値が 'system' に戻る race を消す。
 */
const themeHandle: Handle = async ({ event, resolve }) => {
	event.locals.theme = pickTheme(event.cookies.get(THEME_COOKIE_NAME));
	return resolve(event);
};

/**
 * security header (PR-N0)。 OWASP 推奨の baseline を付与。
 *
 * CSP は `svelte.config.js` の `kit.csp` 一本化のため本 hook では touch しない
 * (hook で set すると kit.csp と上書き衝突)。 本 hook で扱うのは CSP 以外の
 * security header のみ:
 *
 * - X-Content-Type-Options: MIME type sniffing 抑止
 * - Referrer-Policy: cross-origin Referer 抑制
 * - Permissions-Policy: camera/microphone/geolocation 等 API を完全 block
 *
 * 注: HSTS (Strict-Transport-Security) は CloudFront 側で設定する想定 (別 issue)、
 * 本 hook では set しない (重複避け)。
 *
 * Refs:
 * - https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
 * - https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy
 */
const securityHeadersHandle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	return response;
};

export const handle: Handle = sequence(
	authjsHandle,
	localeHandle,
	themeHandle,
	securityHeadersHandle
);
