import { describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { requireSession } from './auth';

function mockEvent(authReturn: unknown): RequestEvent {
	return {
		locals: {
			auth: () => authReturn
		}
	} as unknown as RequestEvent;
}

interface HttpErrorLike {
	status: number;
	body: { message: string };
}

function expectHttpError(fn: () => unknown, status: number, messageRegex: RegExp): void {
	try {
		fn();
		throw new Error('expected requireSession to throw, but it did not');
	} catch (e) {
		const err = e as HttpErrorLike;
		expect(err.status).toBe(status);
		expect(err.body.message).toMatch(messageRegex);
	}
}

describe('requireSession', () => {
	it('returns AppSession when Clerk session has userId + primaryEmail', () => {
		const event = mockEvent({
			userId: 'user_abc',
			sessionClaims: { primaryEmail: 'alice@example.com' }
		});

		const session = requireSession(event);

		expect(session).toEqual({
			userId: 'user_abc',
			email: 'alice@example.com',
			name: undefined,
			teamId: 'team_default'
		});
	});

	it('falls back to sessionClaims.email when primaryEmail is missing', () => {
		const event = mockEvent({
			userId: 'user_abc',
			sessionClaims: { email: 'fallback@example.com' }
		});

		expect(requireSession(event).email).toBe('fallback@example.com');
	});

	it('throws 401 when locals.auth is not a function (no auth handler installed)', () => {
		const event = { locals: {} } as unknown as RequestEvent;
		expectHttpError(() => requireSession(event), 401, /認証/);
	});

	it('throws 401 when userId is null (Clerk: signed out)', () => {
		const event = mockEvent({ userId: null });
		expectHttpError(() => requireSession(event), 401, /認証/);
	});

	it('throws 401 when locals.auth() returns a Promise (Auth.js without providers, no session)', () => {
		// Auth.js の locals.auth は Promise<Session | null> を返す。Clerk 上書きが効いていない
		// 状況のシミュレーション。Clerk 同居中は Promise が返ってくる時点で認証なし扱い。
		const event = mockEvent(Promise.resolve(null));
		expectHttpError(() => requireSession(event), 401, /認証/);
	});

	it('throws 401 when sessionClaims has no email at all', () => {
		const event = mockEvent({
			userId: 'user_abc',
			sessionClaims: {}
		});
		expectHttpError(() => requireSession(event), 401, /メールアドレス/);
	});
});
