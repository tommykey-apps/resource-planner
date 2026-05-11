import { describe, expect, it, vi, beforeEach } from 'vitest';

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
const updateAssignmentMock = vi.fn();
const createResourceMock = vi.fn();

vi.mock('$lib/auth', () => ({
	requireSession: (event: unknown) => requireSessionMock(event)
}));

vi.mock('$lib/repository', () => ({
	createResource: (...args: unknown[]) => createResourceMock(...args),
	updateResource: vi.fn(),
	deleteResource: vi.fn(),
	createProject: vi.fn(),
	updateProject: vi.fn(),
	deleteProject: vi.fn(),
	createAssignment: vi.fn(),
	updateAssignment: (...args: unknown[]) => updateAssignmentMock(...args),
	deleteAssignment: vi.fn()
}));

import { actions } from './+page.server';

function makeEvent(form: Record<string, string>) {
	const data = new FormData();
	for (const [k, v] of Object.entries(form)) data.append(k, v);
	return {
		request: { formData: async () => data }
	} as unknown as Parameters<NonNullable<typeof actions.updateAssignment>>[0];
}

describe('?/updateAssignment action (#99)', () => {
	beforeEach(() => {
		requireSessionMock.mockReset().mockResolvedValue({ teamId: 'team_default', userId: 'u1' });
		updateAssignmentMock.mockReset().mockResolvedValue(undefined);
	});

	it('is exported on actions', () => {
		expect(typeof actions.updateAssignment).toBe('function');
	});

	it('calls updateAssignment(teamId, prevStartDate, payload) with endDateExclusive transform applied', async () => {
		const event = makeEvent({
			id: 'asn-1',
			resourceId: 'r1',
			projectId: 'p1',
			prevStartDate: '2026-05-01',
			startDate: '2026-05-03',
			endDate: '2026-05-09' // inclusive
		});
		const result = await actions.updateAssignment!(event);
		expect(updateAssignmentMock).toHaveBeenCalledTimes(1);
		const [teamId, prevStartDate, payload] = updateAssignmentMock.mock.calls[0];
		expect(teamId).toBe('team_default');
		expect(prevStartDate).toBe('2026-05-01');
		expect(payload).toEqual({
			id: 'asn-1',
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
			resourceId: 'r1',
			projectId: 'p1',
			prevStartDate: '2026-05-01',
			startDate: '2026-05-10',
			endDate: '2026-05-09'
		});
		const result = (await actions.updateAssignment!(event)) as {
			status: number;
			data: { action: string; errors: Record<string, string> };
		};
		expect(result.status).toBe(400);
		expect(result.data.errors.endDate).toBeTruthy();
		expect(updateAssignmentMock).not.toHaveBeenCalled();
	});

	it('returns 400 failure when prevStartDate is missing or wrong format', async () => {
		const event = makeEvent({
			id: 'asn-1',
			resourceId: 'r1',
			projectId: 'p1',
			prevStartDate: 'not-a-date',
			startDate: '2026-05-03',
			endDate: '2026-05-09'
		});
		const result = (await actions.updateAssignment!(event)) as {
			status: number;
			data: { errors: Record<string, string> };
		};
		expect(result.status).toBe(400);
		expect(result.data.errors.prevStartDate).toBeTruthy();
		expect(updateAssignmentMock).not.toHaveBeenCalled();
	});
});

/**
 * #121: createResource action は optimistic UI のため、作成された Resource entity を success
 * result に含めて返す。フロント側で temp ID → real ID への swap に使う。
 */
describe('?/createResource action (#121)', () => {
	beforeEach(() => {
		requireSessionMock.mockReset().mockResolvedValue({ teamId: 'team_default', userId: 'u1' });
		createResourceMock.mockReset();
	});

	it('returns the created resource on success for optimistic UI swap', async () => {
		createResourceMock.mockResolvedValue({ id: 'res-real-id', name: 'Alice' });
		const event = makeEvent({ name: 'Alice' });
		const result = (await actions.createResource!(event)) as {
			action: string;
			success: boolean;
			resource: { id: string; name: string };
		};
		expect(result.action).toBe('createResource');
		expect(result.success).toBe(true);
		expect(result.resource).toEqual({ id: 'res-real-id', name: 'Alice' });
	});

	it('still returns 400 failure for invalid name (no resource in result)', async () => {
		const event = makeEvent({ name: '' });
		const result = (await actions.createResource!(event)) as {
			status: number;
			data: { errors: Record<string, string> };
		};
		expect(result.status).toBe(400);
		expect(createResourceMock).not.toHaveBeenCalled();
	});
});
