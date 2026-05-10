import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { handle as authjsHandle } from './auth';
import { COOKIE_NAME, pickLocaleFromAcceptLanguage, type Locale } from '$lib/i18n/index.svelte';

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

export const handle: Handle = sequence(authjsHandle, localeHandle);
