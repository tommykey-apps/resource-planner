import { describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';

/**
 * #168 defense in depth: 既に sign-in 済 user が /sign-in に navigate しても
 * email 入力 form を見せず home (/) へ送る。 callbackUrl の hidden input が
 * 期待通り効いている前提でも、 外部リンク踏み戻り等での誤認を防ぐ二重 guard。
 *
 * unauth 時は従来通り csrfToken を含む load 結果を返す。
 */
function makeEvent(opts: { session: { user: { id: string } } | null; csrfBody?: string }) {
	const fetchMock = vi.fn(async () =>
		opts.csrfBody !== undefined
			? new Response(opts.csrfBody, { status: 200 })
			: new Response('{"csrfToken":"stub-csrf"}', { status: 200 })
	);
	return {
		fetch: fetchMock,
		locals: {
			auth: vi.fn(async () => opts.session)
		}
	} as unknown as Parameters<typeof load>[0];
}

describe('sign-in load — auth-aware redirect (#168)', () => {
	it('redirects signed-in user to / (defense in depth for callbackUrl)', async () => {
		await expect(load(makeEvent({ session: { user: { id: 'u1' } } }))).rejects.toMatchObject({
			status: 303,
			location: '/'
		});
	});

	it('returns csrfToken when user is unauthenticated', async () => {
		const result = await load(makeEvent({ session: null }));
		expect(result).toEqual({ csrfToken: 'stub-csrf' });
	});

	it('falls back to empty csrfToken when /auth/csrf fails (existing fail-soft behavior)', async () => {
		const event = makeEvent({ session: null });
		(event as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch.mockRejectedValueOnce(
			new Error('network')
		);
		const result = await load(event);
		expect(result).toEqual({ csrfToken: '' });
	});
});
