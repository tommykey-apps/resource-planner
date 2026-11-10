import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ServerError } from '$lib/shared/forms/server-error';
import { makeEntriesEvent, makeEvent } from '$lib/shared/forms/fake-action-event';

/** resource の form actions。 repository / auth はモックし、 handler の引数 mapping + 戻り値だけを assert する。 */
const requireSessionMock = vi.fn();
const createResourceMock = vi.fn();
const updateResourceMock = vi.fn();
const deleteResourceMock = vi.fn();
const deleteResourcesMock = vi.fn();
const moveResourcesToDepartmentMock = vi.fn();

// ADR 0012/0013: 競合系を instanceof で判定するため mock でも実クラスを export。 vi.mock factory は
// 巻き上げられるので vi.hoisted で先に初期化。
const { BulkTargetMissingError, ResourceEmailConflictError } = vi.hoisted(() => {
	class BulkTargetMissingError extends Error {
		constructor() {
			super('bulk target missing');
			this.name = 'BulkTargetMissingError';
		}
	}
	class ResourceEmailConflictError extends Error {
		constructor() {
			super('resource email conflict');
			this.name = 'ResourceEmailConflictError';
		}
	}
	return { BulkTargetMissingError, ResourceEmailConflictError };
});

vi.mock('$lib/features/auth/session.server', () => ({
	requireSession: (event: unknown) => requireSessionMock(event)
}));

vi.mock('./repository.server', () => ({
	createResource: (...args: unknown[]) => createResourceMock(...args),
	updateResource: (...args: unknown[]) => updateResourceMock(...args),
	deleteResource: (...args: unknown[]) => deleteResourceMock(...args),
	deleteResources: (...args: unknown[]) => deleteResourcesMock(...args),
	moveResourcesToDepartment: (...args: unknown[]) => moveResourcesToDepartmentMock(...args),
	BulkTargetMissingError,
	ResourceEmailConflictError
}));

import { resourceActions as actions } from './actions.server';

const SESSION = { teamId: 'team_default', userId: 'u1' };

function resetAllMocks() {
	requireSessionMock.mockReset().mockResolvedValue(SESSION);
	createResourceMock.mockReset().mockResolvedValue(undefined);
	updateResourceMock.mockReset().mockResolvedValue(undefined);
	deleteResourceMock.mockReset().mockResolvedValue(undefined);
}

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
		createResourceMock.mockResolvedValue({
			id: 'res-real-id',
			name: 'Alice',
			email: 'alice@example.com'
		});
		const event = makeEvent({ name: 'Alice', email: 'alice@example.com' });
		const result = (await actions.createResource!(event)) as {
			action: string;
			success: boolean;
			resource: { id: string; name: string; email: string };
		};
		expect(result.action).toBe('createResource');
		expect(result.success).toBe(true);
		expect(result.resource).toEqual({
			id: 'res-real-id',
			name: 'Alice',
			email: 'alice@example.com'
		});
	});

	it('passes the normalized email to the repository', async () => {
		createResourceMock.mockResolvedValue({ id: 'x', name: 'Alice', email: 'alice@example.com' });
		await actions.createResource!(makeEvent({ name: 'Alice', email: ' Alice@Example.com ' }));
		expect(createResourceMock).toHaveBeenCalledWith('team_default', {
			name: 'Alice',
			email: 'alice@example.com'
		});
	});

	it('400 with errors.email = required when email is empty', async () => {
		const r = (await actions.createResource!(makeEvent({ name: 'Alice', email: '' }))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.email).toEqual({ code: 'required', field: 'email' });
		expect(createResourceMock).not.toHaveBeenCalled();
	});

	it('400 with errors.email = invalidEmail when email is malformed', async () => {
		const r = (await actions.createResource!(makeEvent({ name: 'Alice', email: 'alice' }))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.email).toEqual({ code: 'invalidEmail', field: 'email' });
	});

	it('ResourceEmailConflictError → 400 with errors.email = emailConflict', async () => {
		createResourceMock.mockRejectedValueOnce(new ResourceEmailConflictError());
		const r = (await actions.createResource!(
			makeEvent({ name: 'Alice', email: 'alice@example.com' })
		)) as {
			status: number;
			data: { action: string; errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.action).toBe('createResource');
		expect(r.data.errors.email).toEqual({ code: 'emailConflict', field: 'email' });
	});

	it('still returns 400 failure for invalid name (no resource in result)', async () => {
		const event = makeEvent({ name: '', email: 'alice@example.com' });
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

	it('createResource: name 超過 → { code: tooLong, field: name, max: 100 }', async () => {
		const r = (await actions.createResource!(
			makeEvent({ name: 'a'.repeat(101), email: 'a@example.com' })
		)) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
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

describe('?/updateResource action', () => {
	beforeEach(resetAllMocks);

	it('calls updateResource(teamId, { id, name, email }) on valid input', async () => {
		await actions.updateResource!(
			makeEvent({ id: 'r1', name: 'Alice', email: 'alice@example.com' })
		);
		expect(updateResourceMock).toHaveBeenCalledWith('team_default', {
			id: 'r1',
			name: 'Alice',
			email: 'alice@example.com'
		});
	});

	it('fails with 400 when email is missing', async () => {
		const r = (await actions.updateResource!(makeEvent({ id: 'r1', name: 'Alice' }))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.email).toEqual({ code: 'required', field: 'email' });
		expect(updateResourceMock).not.toHaveBeenCalled();
	});

	it('ResourceEmailConflictError → 400 with errors.email = emailConflict', async () => {
		updateResourceMock.mockRejectedValueOnce(new ResourceEmailConflictError());
		const r = (await actions.updateResource!(
			makeEvent({ id: 'r1', name: 'Alice', email: 'alice@example.com' })
		)) as {
			status: number;
			data: { action: string; errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.action).toBe('updateResource');
		expect(r.data.errors.email).toEqual({ code: 'emailConflict', field: 'email' });
	});

	it('fails with 400 when id is missing', async () => {
		const r = (await actions.updateResource!(
			makeEvent({ name: 'Alice', email: 'alice@example.com' })
		)) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(updateResourceMock).not.toHaveBeenCalled();
	});

	it('fails with 400 when name is empty', async () => {
		const r = (await actions.updateResource!(
			makeEvent({ id: 'r1', name: '', email: 'alice@example.com' })
		)) as {
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

/**
 * 一括操作 (表で選んだ行)。 ids は同じ key を繰り返して送る (`formData.getAll('ids')`)。
 * 削除は 1 件ごとに原子的なので、 一部失敗しても成功分の件数と失敗した id を返す。
 */
describe('?/deleteResources action (一括削除)', () => {
	beforeEach(() => {
		resetAllMocks();
		deleteResourcesMock.mockReset();
	});

	it('繰り返した ids をまとめて deleteResources(teamId, ids) に渡し、 結果を返す', async () => {
		deleteResourcesMock.mockResolvedValue({ deleted: ['r1', 'r2'], failed: [] });
		const r = (await actions.deleteResources!(
			makeEntriesEvent([
				['ids', 'r1'],
				['ids', 'r2']
			])
		)) as { success: boolean; deleted: string[]; failed: string[] };
		expect(deleteResourcesMock).toHaveBeenCalledWith('team_default', ['r1', 'r2']);
		expect(r).toMatchObject({ success: true, deleted: ['r1', 'r2'], failed: [] });
	});

	it('一部失敗したら fail(500) で成功分と失敗した id を返す', async () => {
		deleteResourcesMock.mockResolvedValue({ deleted: ['r1'], failed: ['r2'] });
		const r = (await actions.deleteResources!(
			makeEntriesEvent([
				['ids', 'r1'],
				['ids', 'r2']
			])
		)) as { status: number; data: { deleted: string[]; failed: string[] } };
		expect(r.status).toBe(500);
		expect(r.data).toMatchObject({ deleted: ['r1'], failed: ['r2'] });
	});

	it('ids が無ければ 400 (repository を呼ばない)', async () => {
		const r = (await actions.deleteResources!(makeEntriesEvent([]))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.ids).toMatchObject({ code: 'required', field: 'ids' });
		expect(deleteResourcesMock).not.toHaveBeenCalled();
	});
});

describe('?/moveResources action (部署の一括変更)', () => {
	beforeEach(() => {
		resetAllMocks();
		moveResourcesToDepartmentMock.mockReset().mockResolvedValue(undefined);
	});

	it('moveResourcesToDepartment(teamId, ids, departmentId) を呼ぶ', async () => {
		const r = (await actions.moveResources!(
			makeEntriesEvent([
				['ids', 'r1'],
				['ids', 'r2'],
				['departmentId', 'd1']
			])
		)) as { success: boolean; moved: number };
		expect(moveResourcesToDepartmentMock).toHaveBeenCalledWith('team_default', ['r1', 'r2'], 'd1');
		expect(r).toMatchObject({ success: true, moved: 2 });
	});

	it('削除済みのメンバーが混ざっていたら 409 (誰も変わらない)', async () => {
		moveResourcesToDepartmentMock.mockRejectedValue(new BulkTargetMissingError());
		const r = (await actions.moveResources!(
			makeEntriesEvent([
				['ids', 'r1'],
				['departmentId', 'd1']
			])
		)) as { status: number; data: { errors: Record<string, ServerError> } };
		expect(r.status).toBe(409);
		expect(r.data.errors.ids).toMatchObject({ code: 'notFound', field: 'ids' });
	});

	it('空の departmentId は未所属 (undefined)', async () => {
		await actions.moveResources!(
			makeEntriesEvent([
				['ids', 'r1'],
				['departmentId', '']
			])
		);
		expect(moveResourcesToDepartmentMock).toHaveBeenCalledWith('team_default', ['r1'], undefined);
	});
});
