import { describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { requireSession } from './auth';

interface HttpErrorLike {
	status: number;
	body: { message: string; code?: string };
}

/**
 * #178: error() の body shape を { message, code } に拡張。
 * - code は machine-readable な i18n key (App.Error 経由で +error.svelte が client 側 translate)
 * - message は fallback (i18n key 未知 / locale unset 時の最低限の表示)
 * - server 側で `t()` を呼ばないことで singleton localeState の cross-request 漏えいを回避
 *   (SvelteKit 公式: https://svelte.dev/docs/kit/state-management — server-side singleton state は危険)
 */
async function expectHttpError(
	fn: () => Promise<unknown>,
	status: number,
	expectedCode: string
): Promise<void> {
	try {
		await fn();
		throw new Error('expected requireSession to throw, but it did not');
	} catch (e) {
		const err = e as HttpErrorLike;
		expect(err.status).toBe(status);
		expect(err.body.code).toBe(expectedCode);
	}
}

function mockEvent(authReturn: () => unknown): RequestEvent {
	return {
		locals: { auth: authReturn }
	} as unknown as RequestEvent;
}

describe('requireSession (Auth.js)', () => {
	it('returns AppSession when Auth.js session has user.id + user.email', async () => {
		const event = mockEvent(async () => ({
			user: { id: 'user_abc', email: 'alice@example.com', name: 'Alice' }
		}));

		const session = await requireSession(event);

		expect(session).toEqual({
			userId: 'user_abc',
			email: 'alice@example.com',
			name: 'Alice',
			teamId: 'team_default'
		});
	});

	it('returns AppSession with name=undefined when Auth.js session lacks name', async () => {
		const event = mockEvent(async () => ({
			user: { id: 'user_abc', email: 'alice@example.com' }
		}));
		const session = await requireSession(event);
		expect(session.name).toBeUndefined();
	});

	// #183: 旧実装の defensive `typeof locals.auth !== 'function'` 早期 throw は撤去。
	// @auth/sveltekit が ambient `App.Locals.auth(): Promise<Session | null>` を declare
	// global で注入するため、 SvelteKit + Auth.js runtime では locals.auth は常に function。
	// そのため「locals.auth is not a function」 case 自体が realistic でなくなった (テスト削除)。

	it('throws 401 with code=authRequired when session is null (signed out)', async () => {
		const event = mockEvent(async () => null);
		await expectHttpError(() => requireSession(event), 401, 'authRequired');
	});

	it('throws 401 with code=authRequired when session has no user', async () => {
		const event = mockEvent(async () => ({}));
		await expectHttpError(() => requireSession(event), 401, 'authRequired');
	});

	it('throws 401 with code=authRequired when user.id is missing', async () => {
		const event = mockEvent(async () => ({ user: { email: 'alice@example.com' } }));
		await expectHttpError(() => requireSession(event), 401, 'authRequired');
	});

	it('throws 401 with code=authRequired when user.email is missing', async () => {
		const event = mockEvent(async () => ({ user: { id: 'user_abc' } }));
		await expectHttpError(() => requireSession(event), 401, 'authRequired');
	});
});
