import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * PATCH /api/assignments/[id] の input → repository 引数 mapping、 zod 検証、 認証 / id missing
 * の error path をカバー (#155 で可視化した P0 coverage の埋め直し)。
 *
 * `error()` は throw する SvelteKit ユーティリティなので、 失敗 path は throw を assert で受ける。
 */

const requireSessionMock = vi.fn();
const updateAssignmentMock = vi.fn();

vi.mock('$lib/auth', () => ({
	requireSession: (event: unknown) => requireSessionMock(event)
}));

vi.mock('$lib/repository', () => ({
	updateAssignment: (...args: unknown[]) => updateAssignmentMock(...args)
}));

import { PATCH } from './+server';

const SESSION = { teamId: 'team_default', userId: 'u1' };

function makeEvent(opts: {
	id?: string;
	body?: unknown;
	bodyParseError?: boolean;
}): Parameters<NonNullable<typeof PATCH>>[0] {
	return {
		params: { id: opts.id ?? 'asn-1' },
		request: {
			json: async () => {
				if (opts.bodyParseError) throw new SyntaxError('invalid JSON');
				return opts.body;
			}
		}
	} as unknown as Parameters<NonNullable<typeof PATCH>>[0];
}

const VALID_BODY = {
	prevStartDate: '2026-05-01',
	resourceId: 'r1',
	projectId: 'p1',
	startDate: '2026-05-03',
	endDateExclusive: '2026-05-10'
};

beforeEach(() => {
	requireSessionMock.mockReset().mockResolvedValue(SESSION);
	updateAssignmentMock.mockReset().mockResolvedValue(undefined);
});

describe('PATCH /api/assignments/[id]', () => {
	it('calls updateAssignment(teamId, prevStartDate, payload) on valid body', async () => {
		const res = (await PATCH(makeEvent({ id: 'asn-1', body: VALID_BODY }))) as Response;
		expect(updateAssignmentMock).toHaveBeenCalledWith('team_default', '2026-05-01', {
			id: 'asn-1',
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-03',
			endDateExclusive: '2026-05-10'
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
	});

	it('throws 400 when id param is missing', async () => {
		await expect(PATCH(makeEvent({ id: '', body: VALID_BODY }))).rejects.toThrow();
		expect(updateAssignmentMock).not.toHaveBeenCalled();
	});

	it('throws 400 when JSON body is malformed', async () => {
		await expect(PATCH(makeEvent({ bodyParseError: true }))).rejects.toThrow();
		expect(updateAssignmentMock).not.toHaveBeenCalled();
	});

	it('throws 400 when startDate >= endDateExclusive (refine, ADR 0004 半開区間が崩れる)', async () => {
		await expect(
			PATCH(
				makeEvent({
					body: { ...VALID_BODY, startDate: '2026-05-10', endDateExclusive: '2026-05-10' }
				})
			)
		).rejects.toThrow();
		expect(updateAssignmentMock).not.toHaveBeenCalled();
	});

	it('throws 400 for non-ISO date strings (zod regex)', async () => {
		await expect(
			PATCH(makeEvent({ body: { ...VALID_BODY, prevStartDate: '2026/05/01' } }))
		).rejects.toThrow();
		expect(updateAssignmentMock).not.toHaveBeenCalled();
	});

	it('throws 400 for missing required fields', async () => {
		await expect(
			PATCH(makeEvent({ body: { prevStartDate: '2026-05-01' } }))
		).rejects.toThrow();
		expect(updateAssignmentMock).not.toHaveBeenCalled();
	});

	it('propagates requireSession failure (e.g. unauth) without repository call', async () => {
		requireSessionMock.mockRejectedValueOnce(new Error('unauthorized'));
		await expect(PATCH(makeEvent({ body: VALID_BODY }))).rejects.toThrow('unauthorized');
		expect(updateAssignmentMock).not.toHaveBeenCalled();
	});

	it('uses session.teamId (server-resolved) — body の teamId を信用しない (cross-tenant 防止)', async () => {
		const malicious = { ...VALID_BODY, teamId: 'other-team' };
		await PATCH(makeEvent({ body: malicious }));
		const [calledTeamId] = updateAssignmentMock.mock.calls[0];
		expect(calledTeamId).toBe('team_default'); // session 由来
		expect(calledTeamId).not.toBe('other-team');
	});
});
