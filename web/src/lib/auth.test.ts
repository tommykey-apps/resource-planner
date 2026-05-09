import { describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { requireSession } from './auth';

interface HttpErrorLike {
	status: number;
	body: { message: string };
}

async function expectHttpError(
	fn: () => Promise<unknown>,
	status: number,
	messageRegex: RegExp
): Promise<void> {
	try {
		await fn();
		throw new Error('expected requireSession to throw, but it did not');
	} catch (e) {
		const err = e as HttpErrorLike;
		expect(err.status).toBe(status);
		expect(err.body.message).toMatch(messageRegex);
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

	it('throws 401 when locals.auth is not a function', async () => {
		const event = { locals: {} } as unknown as RequestEvent;
		await expectHttpError(() => requireSession(event), 401, /認証/);
	});

	it('throws 401 when session is null (signed out)', async () => {
		const event = mockEvent(async () => null);
		await expectHttpError(() => requireSession(event), 401, /認証/);
	});

	it('throws 401 when session has no user', async () => {
		const event = mockEvent(async () => ({}));
		await expectHttpError(() => requireSession(event), 401, /認証/);
	});

	it('throws 401 when user.id is missing', async () => {
		const event = mockEvent(async () => ({ user: { email: 'alice@example.com' } }));
		await expectHttpError(() => requireSession(event), 401, /認証/);
	});

	it('throws 401 when user.email is missing', async () => {
		const event = mockEvent(async () => ({ user: { id: 'user_abc' } }));
		await expectHttpError(() => requireSession(event), 401, /認証/);
	});
});
