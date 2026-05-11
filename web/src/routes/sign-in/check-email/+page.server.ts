import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * #101 item 4: 直接 navigate / ブックマークでの到達を防ぐ guard。
 *
 * `sec-fetch-site` ヘッダ (Chrome / FF / Safari 16.4+) で navigation 種別を判定:
 *   - 'none'                       : direct entry / bookmark → /sign-in に redirect
 *   - 'same-origin' / 'same-site'  : in-app navigation → 通す
 *   - 欠落                         : 古い browser → fail-open で通す (過剰防御を避ける)
 */
export const load: PageServerLoad = async ({ request }) => {
	const fetchSite = request.headers.get('sec-fetch-site');
	if (fetchSite === 'none') {
		redirect(303, '/sign-in');
	}
	return {};
};
