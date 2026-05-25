import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * PATCH /api/assignments/[id] の input → repository 引数 mapping、 zod 検証、 認証 / id missing
 * の error path をカバー (#155 で可視化した P0 coverage の埋め直し)。
 *
 * #179: validation error 系は `error(400, ...)` (throw) ではなく `json({ errors }, { status: 400 })`
 * (Response return) に統一 (SvelteKit 公式: API endpoint で validation error は json() 推奨)。
 * 認証エラー (`requireSession` 由来) は引き続き throw。
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

async function expectErrorResponse(
	res: Response,
	status: number,
	predicate: (body: { errors: Record<string, { code: string; field: string; max?: number }> }) => void
): Promise<void> {
	expect(res.status).toBe(status);
	const body = (await res.json()) as {
		errors: Record<string, { code: string; field: string; max?: number }>;
	};
	expect(body).toHaveProperty('errors');
	predicate(body);
}

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

	it('returns 400 with errors.id when id param is missing (#179)', async () => {
		const res = (await PATCH(makeEvent({ id: '', body: VALID_BODY }))) as Response;
		await expectErrorResponse(res, 400, (body) => {
			expect(body.errors.id).toEqual({ code: 'required', field: 'id' });
		});
		expect(updateAssignmentMock).not.toHaveBeenCalled();
	});

	it('returns 400 with errors.body when JSON body is malformed (#179)', async () => {
		const res = (await PATCH(makeEvent({ bodyParseError: true }))) as Response;
		await expectErrorResponse(res, 400, (body) => {
			expect(body.errors.body).toEqual({ code: 'invalidJson', field: 'body' });
		});
		expect(updateAssignmentMock).not.toHaveBeenCalled();
	});

	it('returns 400 with formatted zod errors when startDate >= endDateExclusive (#179)', async () => {
		const res = (await PATCH(
			makeEvent({
				body: { ...VALID_BODY, startDate: '2026-05-10', endDateExclusive: '2026-05-10' }
			})
		)) as Response;
		await expectErrorResponse(res, 400, (body) => {
			expect(body.errors.endDateExclusive?.code).toBe('endBeforeStart');
		});
		expect(updateAssignmentMock).not.toHaveBeenCalled();
	});

	it('returns 400 with formatted zod errors for non-ISO date strings (#179)', async () => {
		const res = (await PATCH(
			makeEvent({ body: { ...VALID_BODY, prevStartDate: '2026/05/01' } })
		)) as Response;
		await expectErrorResponse(res, 400, (body) => {
			expect(body.errors.prevStartDate?.code).toBe('invalidDateFormat');
		});
		expect(updateAssignmentMock).not.toHaveBeenCalled();
	});

	it('returns 400 with formatted zod errors for missing required fields (#179)', async () => {
		const res = (await PATCH(makeEvent({ body: { prevStartDate: '2026-05-01' } }))) as Response;
		await expectErrorResponse(res, 400, (body) => {
			// resourceId / projectId / startDate / endDateExclusive のいずれかが required で出る
			expect(Object.keys(body.errors).length).toBeGreaterThan(0);
		});
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
