import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

/**
 * #101 item 4: `/sign-in/check-email` をブックマーク等で直接 navigate されたら
 * `/sign-in` に redirect する。`sec-fetch-site` ヘッダ (Chrome/FF/Safari16+) で判定:
 *   - 'none'       : direct entry / bookmark → redirect
 *   - 'same-origin' / 'same-site' : 同一サイト経由 → 通す
 *   - 欠落         : 古い browser、識別不能 → 通す (fail-open、過剰防御を避ける)
 */
function makeEvent(headers: Record<string, string> = {}) {
	const h = new Headers(headers);
	return {
		request: { headers: h } as unknown as Request
	} as Parameters<typeof load>[0];
}

describe('check-email load — direct navigation guard (#101)', () => {
	it('redirects to /sign-in when sec-fetch-site is "none" (direct entry / bookmark)', async () => {
		await expect(load(makeEvent({ 'sec-fetch-site': 'none' }))).rejects.toMatchObject({
			status: 303,
			location: '/sign-in'
		});
	});

	it('allows same-origin navigation (Auth.js redirect or in-app link)', async () => {
		const result = await load(makeEvent({ 'sec-fetch-site': 'same-origin' }));
		expect(result).toEqual({});
	});

	it('allows same-site navigation', async () => {
		const result = await load(makeEvent({ 'sec-fetch-site': 'same-site' }));
		expect(result).toEqual({});
	});

	it('allows requests with no sec-fetch-site header (older browsers — fail-open)', async () => {
		const result = await load(makeEvent({}));
		expect(result).toEqual({});
	});
});
