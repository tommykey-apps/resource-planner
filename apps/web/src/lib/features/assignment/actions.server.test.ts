import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ServerError } from '$lib/shared/forms/server-error';
import { makeEvent } from '$lib/shared/forms/fake-action-event';

/**
 * `?/updateAssignment` action の TDD (#99 item 1)。
 *
 * 既存の form action パターン (updateResource / updateProject) と整合させつつ、
 * Assignment 固有の `prevStartDate` 引数を渡せること、Zod validation で `endDate < startDate`
 * を fail させること、を保証する。
 *
 * repository / auth はモックし、handler の引数 mapping + 戻り値だけを assert。
 */

const requireSessionMock = vi.fn();
const createAssignmentMock = vi.fn();
const updateAssignmentMock = vi.fn();
const deleteAssignmentMock = vi.fn();

// ADR 0012/0013: 競合系を instanceof で判定するため mock でも実クラスを export。 vi.mock factory は
// 巻き上げられるので vi.hoisted で先に初期化。
const { AssignmentVersionConflictError } = vi.hoisted(() => {
	class AssignmentVersionConflictError extends Error {
		constructor(public readonly assignmentId: string) {
			super(`assignment ${assignmentId} version conflict`);
			this.name = 'AssignmentVersionConflictError';
		}
	}
	return { AssignmentVersionConflictError };
});

vi.mock('$lib/features/auth/session.server', () => ({
	requireSession: (event: unknown) => requireSessionMock(event)
}));

vi.mock('./repository.server', () => ({
	createAssignment: (...args: unknown[]) => createAssignmentMock(...args),
	updateAssignment: (...args: unknown[]) => updateAssignmentMock(...args),
	deleteAssignment: (...args: unknown[]) => deleteAssignmentMock(...args),
	AssignmentVersionConflictError
}));

import { assignmentDeleteActions, assignmentEditActions } from './actions.server';

const actions = { ...assignmentEditActions, ...assignmentDeleteActions };

const SESSION = { teamId: 'team_default', userId: 'u1' };

function resetAllMocks() {
	requireSessionMock.mockReset().mockResolvedValue(SESSION);
	createAssignmentMock.mockReset().mockResolvedValue(undefined);
	deleteAssignmentMock.mockReset().mockResolvedValue(undefined);
}

describe('?/updateAssignment action (#99 / ADR 0012)', () => {
	beforeEach(() => {
		requireSessionMock.mockReset().mockResolvedValue({ teamId: 'team_default', userId: 'u1' });
		updateAssignmentMock.mockReset().mockResolvedValue(4);
	});

	it('is exported on actions', () => {
		expect(typeof actions.updateAssignment).toBe('function');
	});

	it('calls updateAssignment(teamId, payload incl expectedVersion) with endDateExclusive transform', async () => {
		const event = makeEvent({
			id: 'asn-1',
			expectedVersion: '3',
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-03',
			endDate: '2026-05-09' // inclusive
		});
		const result = await actions.updateAssignment!(event);
		expect(updateAssignmentMock).toHaveBeenCalledTimes(1);
		const [teamId, payload] = updateAssignmentMock.mock.calls[0];
		expect(teamId).toBe('team_default');
		expect(payload).toEqual({
			id: 'asn-1',
			expectedVersion: 3,
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-03',
			endDateExclusive: '2026-05-10' // endDate + 1
		});
		expect(result).toEqual({ action: 'updateAssignment', success: true });
	});

	it('returns 400 failure when endDate is before startDate (zod refine)', async () => {
		const event = makeEvent({
			id: 'asn-1',
			expectedVersion: '3',
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-10',
			endDate: '2026-05-09'
		});
		const result = (await actions.updateAssignment!(event)) as {
			status: number;
			data: { action: string; errors: Record<string, ServerError> };
		};
		expect(result.status).toBe(400);
		// #139: server は i18n 済文字列を返さず { code, field } を返す契約
		expect(result.data.errors.endDate).toEqual({ code: 'endBeforeStart', field: 'endDate' });
		expect(updateAssignmentMock).not.toHaveBeenCalled();
	});

	it('returns 409 failure with conflict flag on version conflict (ADR 0012)', async () => {
		updateAssignmentMock.mockRejectedValueOnce(new AssignmentVersionConflictError('asn-1'));
		const event = makeEvent({
			id: 'asn-1',
			expectedVersion: '3',
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-03',
			endDate: '2026-05-09'
		});
		const result = (await actions.updateAssignment!(event)) as {
			status: number;
			data: { action: string; conflict: boolean };
		};
		expect(result.status).toBe(409);
		expect(result.data).toMatchObject({ action: 'updateAssignment', conflict: true });
	});
});

/**
 * #139: server から i18n 済文字列を返さない契約。 deleteResource / deleteProject /
 * deleteAssignment の id missing / startDate missing は { code, field } 形式で返ること
 * と、 zod 経由の error が { code: 'required' | 'tooLong' | ... } になることを固定する。
 */
describe('#139 server error wire format (code, no localized strings)', () => {
	beforeEach(() => {
		requireSessionMock.mockReset().mockResolvedValue({ teamId: 'team_default', userId: 'u1' });
	});

	it('deleteAssignment: id missing → { code: required, field: id }', async () => {
		const r = (await actions.deleteAssignment!(makeEvent({}))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.id).toEqual({ code: 'required', field: 'id' });
	});
});

describe('?/createAssignment action (inclusive endDate → endDateExclusive transform, ADR 0004)', () => {
	beforeEach(resetAllMocks);

	it('transforms endDate (inclusive) → endDateExclusive (+1 day) before calling repository', async () => {
		await actions.createAssignment!(
			makeEvent({
				resourceId: 'r1',
				projectId: 'p1',
				startDate: '2026-05-01',
				endDate: '2026-05-07'
			})
		);
		expect(createAssignmentMock).toHaveBeenCalledWith('team_default', {
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-05-08'
		});
	});

	it('rejects startDate > endDate (zod refine)', async () => {
		const r = (await actions.createAssignment!(
			makeEvent({
				resourceId: 'r1',
				projectId: 'p1',
				startDate: '2026-05-10',
				endDate: '2026-05-09'
			})
		)) as { status: number; data: { errors: Record<string, ServerError> } };
		expect(r.status).toBe(400);
		expect(r.data.errors.endDate).toBeTruthy();
		expect(createAssignmentMock).not.toHaveBeenCalled();
	});

	it('rejects non-ISO date strings', async () => {
		const r = (await actions.createAssignment!(
			makeEvent({
				resourceId: 'r1',
				projectId: 'p1',
				startDate: '2026/05/01',
				endDate: '2026-05-07'
			})
		)) as { status: number };
		expect(r.status).toBe(400);
	});
});

describe('?/deleteAssignment action (ADR 0012: SK = ASN#{id} なので id のみ)', () => {
	beforeEach(resetAllMocks);

	it('calls deleteAssignment(teamId, id) on valid input', async () => {
		await actions.deleteAssignment!(makeEvent({ id: 'asn-1' }));
		expect(deleteAssignmentMock).toHaveBeenCalledWith('team_default', 'asn-1');
	});

	it('fails 400 when id is missing', async () => {
		const r = (await actions.deleteAssignment!(makeEvent({}))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.id).toBeTruthy();
		expect(deleteAssignmentMock).not.toHaveBeenCalled();
	});
});
