import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ServerError } from '$lib/forms/server-error';

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
const createResourceMock = vi.fn();
const updateResourceMock = vi.fn();
const deleteResourceMock = vi.fn();
const createProjectMock = vi.fn();
const updateProjectMock = vi.fn();
const deleteProjectMock = vi.fn();
const createAssignmentMock = vi.fn();
const updateAssignmentMock = vi.fn();
const deleteAssignmentMock = vi.fn();

vi.mock('$lib/auth', () => ({
	requireSession: (event: unknown) => requireSessionMock(event)
}));

vi.mock('$lib/repository', () => ({
	createResource: (...args: unknown[]) => createResourceMock(...args),
	updateResource: (...args: unknown[]) => updateResourceMock(...args),
	deleteResource: (...args: unknown[]) => deleteResourceMock(...args),
	createProject: (...args: unknown[]) => createProjectMock(...args),
	updateProject: (...args: unknown[]) => updateProjectMock(...args),
	deleteProject: (...args: unknown[]) => deleteProjectMock(...args),
	createAssignment: (...args: unknown[]) => createAssignmentMock(...args),
	updateAssignment: (...args: unknown[]) => updateAssignmentMock(...args),
	deleteAssignment: (...args: unknown[]) => deleteAssignmentMock(...args)
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
			data: { action: string; errors: Record<string, ServerError> };
		};
		expect(result.status).toBe(400);
		// #139: server は i18n 済文字列を返さず { code, field } を返す契約
		expect(result.data.errors.endDate).toEqual({ code: 'endBeforeStart', field: 'endDate' });
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
			data: { errors: Record<string, ServerError> };
		};
		expect(result.status).toBe(400);
		expect(result.data.errors.prevStartDate).toEqual({
			code: 'invalidDateFormat',
			field: 'prevStartDate'
		});
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
			data: { errors: Record<string, ServerError> };
		};
		expect(result.status).toBe(400);
		expect(result.data.errors.name).toEqual({ code: 'required', field: 'name' });
		expect(createResourceMock).not.toHaveBeenCalled();
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

	it('deleteResource: id missing → { code: required, field: id }', async () => {
		const r = (await actions.deleteResource!(makeEvent({}))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.id).toEqual({ code: 'required', field: 'id' });
	});

	it('deleteProject: id missing → { code: required, field: id }', async () => {
		const r = (await actions.deleteProject!(makeEvent({}))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.id).toEqual({ code: 'required', field: 'id' });
	});

	it('deleteAssignment: id missing → { code: required, field: id }', async () => {
		const r = (await actions.deleteAssignment!(
			makeEvent({ startDate: '2026-05-01' })
		)) as { status: number; data: { errors: Record<string, ServerError> } };
		expect(r.status).toBe(400);
		expect(r.data.errors.id).toEqual({ code: 'required', field: 'id' });
	});

	it('deleteAssignment: startDate 不正 → { code: invalidDateFormat, field: startDate }', async () => {
		const r = (await actions.deleteAssignment!(
			makeEvent({ id: 'a1', startDate: '2026/05/01' })
		)) as { status: number; data: { errors: Record<string, ServerError> } };
		expect(r.status).toBe(400);
		expect(r.data.errors.startDate).toEqual({
			code: 'invalidDateFormat',
			field: 'startDate'
		});
	});

	it('createProject: 不正 color → { code: invalidColorFormat, field: color }', async () => {
		const r = (await actions.createProject!(
			makeEvent({ name: 'P', color: 'red' })
		)) as { status: number; data: { errors: Record<string, ServerError> } };
		expect(r.status).toBe(400);
		expect(r.data.errors.color).toEqual({
			code: 'invalidColorFormat',
			field: 'color'
		});
	});

	it('createResource: name 超過 → { code: tooLong, field: name, max: 100 }', async () => {
		const r = (await actions.createResource!(
			makeEvent({ name: 'a'.repeat(101) })
		)) as { status: number; data: { errors: Record<string, ServerError> } };
		expect(r.status).toBe(400);
		expect(r.data.errors.name).toEqual({ code: 'tooLong', field: 'name', max: 100 });
	});

	it('error value は **必ず object** (string が混ざらない)', async () => {
		const r = (await actions.deleteResource!(makeEvent({}))) as {
			data: { errors: Record<string, unknown> };
		};
		for (const v of Object.values(r.data.errors)) {
			expect(typeof v).toBe('object');
			expect(v).not.toBeNull();
		}
	});
});

/**
 * P0 coverage 拡張 (#155 で missing test を可視化した結果)。 9 action 中 createResource /
 * updateAssignment しかカバーされていなかったので、 残り 7 action の success path + 400 failure
 * を埋める。 各 action の入力 → repository 呼び出し引数 mapping、 zod 検証境界、 SK の構造
 * (startDate 必須等) の contract を固定する。
 */

const SESSION = { teamId: 'team_default', userId: 'u1' };

function resetAllMocks() {
	requireSessionMock.mockReset().mockResolvedValue(SESSION);
	createResourceMock.mockReset().mockResolvedValue(undefined);
	updateResourceMock.mockReset().mockResolvedValue(undefined);
	deleteResourceMock.mockReset().mockResolvedValue(undefined);
	createProjectMock.mockReset().mockResolvedValue(undefined);
	updateProjectMock.mockReset().mockResolvedValue(undefined);
	deleteProjectMock.mockReset().mockResolvedValue(undefined);
	createAssignmentMock.mockReset().mockResolvedValue(undefined);
	deleteAssignmentMock.mockReset().mockResolvedValue(undefined);
}

describe('?/updateResource action', () => {
	beforeEach(resetAllMocks);

	it('calls updateResource(teamId, { id, name }) on valid input', async () => {
		await actions.updateResource!(makeEvent({ id: 'r1', name: 'Alice' }));
		expect(updateResourceMock).toHaveBeenCalledWith('team_default', { id: 'r1', name: 'Alice' });
	});

	it('fails with 400 when id is missing', async () => {
		const r = (await actions.updateResource!(makeEvent({ name: 'Alice' }))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(updateResourceMock).not.toHaveBeenCalled();
	});

	it('fails with 400 when name is empty', async () => {
		const r = (await actions.updateResource!(makeEvent({ id: 'r1', name: '' }))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.name).toBeTruthy();
	});
});

describe('?/deleteResource action (cascade は repository 側、 ここでは引数 mapping のみ)', () => {
	beforeEach(resetAllMocks);

	it('calls deleteResource(teamId, id) on valid input', async () => {
		const r = (await actions.deleteResource!(makeEvent({ id: 'r1' }))) as {
			action: string;
			success: boolean;
		};
		expect(deleteResourceMock).toHaveBeenCalledWith('team_default', 'r1');
		expect(r.success).toBe(true);
	});

	it('fails with 400 when id is missing or empty (no repository call)', async () => {
		const r = (await actions.deleteResource!(makeEvent({}))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.id).toBeTruthy();
		expect(deleteResourceMock).not.toHaveBeenCalled();
	});
});

describe('?/createProject action', () => {
	beforeEach(resetAllMocks);

	it('calls createProject(teamId, { name, color, ...empty detail }) on valid input', async () => {
		await actions.createProject!(makeEvent({ name: 'Alpha', color: '#0EA5E9' }));
		// #187: schema 拡張で description/tags/links が transform output に含まれる
		// (form omit 時は undefined / [])。 repository 側で空判定して REMOVE / 除外。
		expect(createProjectMock).toHaveBeenCalledWith('team_default', {
			name: 'Alpha',
			color: '#0EA5E9',
			description: undefined,
			tags: [],
			links: []
		});
	});

	it('rejects color not matching #RRGGBB', async () => {
		const r = (await actions.createProject!(
			makeEvent({ name: 'X', color: 'red' })
		)) as { status: number; data: { errors: Record<string, ServerError> } };
		expect(r.status).toBe(400);
		expect(r.data.errors.color).toBeTruthy();
		expect(createProjectMock).not.toHaveBeenCalled();
	});
});

describe('?/updateProject action', () => {
	beforeEach(resetAllMocks);

	it('calls updateProject(teamId, { id, name, color, ...empty detail })', async () => {
		await actions.updateProject!(
			makeEvent({ id: 'p1', name: 'Beta', color: '#10B981' })
		);
		// #187: schema 拡張で description/tags/links が transform output に含まれる。
		expect(updateProjectMock).toHaveBeenCalledWith('team_default', {
			id: 'p1',
			name: 'Beta',
			color: '#10B981',
			description: undefined,
			tags: [],
			links: []
		});
	});

	it('fails 400 when name exceeds 100 chars', async () => {
		const r = (await actions.updateProject!(
			makeEvent({ id: 'p1', name: 'x'.repeat(101), color: '#000000' })
		)) as { status: number; data: { errors: Record<string, ServerError> } };
		expect(r.status).toBe(400);
		expect(r.data.errors.name).toBeTruthy();
	});
});

describe('?/deleteProject action', () => {
	beforeEach(resetAllMocks);

	it('calls deleteProject(teamId, id) on valid input', async () => {
		await actions.deleteProject!(makeEvent({ id: 'p1' }));
		expect(deleteProjectMock).toHaveBeenCalledWith('team_default', 'p1');
	});

	it('fails 400 when id is missing', async () => {
		const r = (await actions.deleteProject!(makeEvent({}))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(deleteProjectMock).not.toHaveBeenCalled();
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

describe('?/deleteAssignment action (SK = ASN#{startDate}#{id} 構造に startDate が必要)', () => {
	beforeEach(resetAllMocks);

	it('calls deleteAssignment(teamId, startDate, id) on valid input', async () => {
		await actions.deleteAssignment!(makeEvent({ id: 'asn-1', startDate: '2026-05-01' }));
		expect(deleteAssignmentMock).toHaveBeenCalledWith('team_default', '2026-05-01', 'asn-1');
	});

	it('fails 400 when id is missing', async () => {
		const r = (await actions.deleteAssignment!(makeEvent({ startDate: '2026-05-01' }))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.id).toBeTruthy();
		expect(deleteAssignmentMock).not.toHaveBeenCalled();
	});

	it('fails 400 when startDate is missing (SK 再構築に必須)', async () => {
		const r = (await actions.deleteAssignment!(makeEvent({ id: 'asn-1' }))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.startDate).toBeTruthy();
		expect(deleteAssignmentMock).not.toHaveBeenCalled();
	});

	it('fails 400 when startDate is not ISO YYYY-MM-DD', async () => {
		const r = (await actions.deleteAssignment!(
			makeEvent({ id: 'asn-1', startDate: '2026/05/01' })
		)) as { status: number; data: { errors: Record<string, ServerError> } };
		expect(r.status).toBe(400);
		expect(r.data.errors.startDate).toBeTruthy();
	});
});
