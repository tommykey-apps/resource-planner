import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ServerError } from '$lib/shared/forms/server-error';
import { makeEvent } from '$lib/shared/forms/fake-action-event';

/** department の form actions。 repository / auth はモックし、 handler の引数 mapping + 戻り値だけを assert する。 */
const requireSessionMock = vi.fn();
const createDepartmentMock = vi.fn();
const moveDepartmentMock = vi.fn();
const renameDepartmentMock = vi.fn();
const deleteDepartmentMock = vi.fn();

// ADR 0012/0013: 競合系を instanceof で判定するため mock でも実クラスを export。 vi.mock factory は
// 巻き上げられるので vi.hoisted で先に初期化。
const { DepartmentTreeError } = vi.hoisted(() => {
	class DepartmentTreeError extends Error {
		constructor(public readonly code: 'cycle' | 'nameConflict' | 'parentNotFound' | 'notFound') {
			super(`department tree violation: ${code}`);
			this.name = 'DepartmentTreeError';
		}
	}
	return { DepartmentTreeError };
});

vi.mock('$lib/features/auth/session.server', () => ({
	requireSession: (event: unknown) => requireSessionMock(event)
}));

vi.mock('./repository.server', () => ({
	createDepartment: (...args: unknown[]) => createDepartmentMock(...args),
	moveDepartment: (...args: unknown[]) => moveDepartmentMock(...args),
	renameDepartment: (...args: unknown[]) => renameDepartmentMock(...args),
	deleteDepartment: (...args: unknown[]) => deleteDepartmentMock(...args),
	DepartmentTreeError
}));

import { departmentActions as actions } from './actions.server';

/**
 * #238 / ADR 0013: createDepartment action (フラット = parentId 省略でルート)。
 */
describe('?/createDepartment action (#238)', () => {
	beforeEach(() => {
		requireSessionMock.mockReset().mockResolvedValue({ teamId: 'team_default', userId: 'u1' });
		createDepartmentMock
			.mockReset()
			.mockResolvedValue({ id: 'd-1', name: '開発本部', parentId: null });
	});

	it('calls createDepartment(teamId, parsed) on valid name', async () => {
		const r = await actions.createDepartment!(makeEvent({ name: '開発本部' }));
		expect(createDepartmentMock).toHaveBeenCalledTimes(1);
		const [teamId, parsed] = createDepartmentMock.mock.calls[0];
		expect(teamId).toBe('team_default');
		expect(parsed).toMatchObject({ name: '開発本部' });
		expect(r).toMatchObject({ action: 'createDepartment', success: true });
	});

	it('fails 400 when name is empty', async () => {
		const r = (await actions.createDepartment!(makeEvent({ name: '' }))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.name).toEqual({ code: 'required', field: 'name' });
		expect(createDepartmentMock).not.toHaveBeenCalled();
	});

	it('#240: DepartmentTreeError(nameConflict) → fail(400) errors.name', async () => {
		createDepartmentMock.mockRejectedValueOnce(new DepartmentTreeError('nameConflict'));
		const r = (await actions.createDepartment!(makeEvent({ name: '開発本部' }))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.name).toEqual({ code: 'nameConflict', field: 'name' });
	});
});

describe('?/moveDepartment action (#240)', () => {
	beforeEach(() => {
		requireSessionMock.mockReset().mockResolvedValue({ teamId: 'team_default', userId: 'u1' });
		moveDepartmentMock.mockReset().mockResolvedValue(undefined);
	});

	it('calls moveDepartment(teamId, id, parentId) on valid input', async () => {
		await actions.moveDepartment!(makeEvent({ id: 'a', parentId: 's' }));
		expect(moveDepartmentMock).toHaveBeenCalledWith('team_default', 'a', 's');
	});

	it('空 parentId はルート化 (null)', async () => {
		await actions.moveDepartment!(makeEvent({ id: 'a', parentId: '' }));
		expect(moveDepartmentMock).toHaveBeenCalledWith('team_default', 'a', null);
	});

	it('DepartmentTreeError(cycle) → fail(400) errors.parentId', async () => {
		moveDepartmentMock.mockRejectedValueOnce(new DepartmentTreeError('cycle'));
		const r = (await actions.moveDepartment!(makeEvent({ id: 'r', parentId: 'a1' }))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.parentId).toEqual({ code: 'cycle', field: 'parentId' });
	});

	it('fails 400 when id is missing', async () => {
		const r = (await actions.moveDepartment!(makeEvent({ parentId: 's' }))) as { status: number };
		expect(r.status).toBe(400);
		expect(moveDepartmentMock).not.toHaveBeenCalled();
	});
});

describe('?/renameDepartment action (#250)', () => {
	beforeEach(() => {
		requireSessionMock.mockReset().mockResolvedValue({ teamId: 'team_default', userId: 'u1' });
		renameDepartmentMock.mockReset().mockResolvedValue(undefined);
	});

	it('calls renameDepartment(teamId, id, name) on valid input', async () => {
		const r = await actions.renameDepartment!(makeEvent({ id: 'a', name: 'サーバ課' }));
		expect(renameDepartmentMock).toHaveBeenCalledWith('team_default', 'a', 'サーバ課');
		expect(r).toMatchObject({ action: 'renameDepartment', success: true });
	});

	it('fails 400 when name is empty', async () => {
		const r = (await actions.renameDepartment!(makeEvent({ id: 'a', name: '' }))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.name).toEqual({ code: 'required', field: 'name' });
		expect(renameDepartmentMock).not.toHaveBeenCalled();
	});

	it('fails 400 when id is missing', async () => {
		const r = (await actions.renameDepartment!(makeEvent({ name: 'X' }))) as { status: number };
		expect(r.status).toBe(400);
		expect(renameDepartmentMock).not.toHaveBeenCalled();
	});

	it('DepartmentTreeError(nameConflict) → fail(400) errors.name', async () => {
		renameDepartmentMock.mockRejectedValueOnce(new DepartmentTreeError('nameConflict'));
		const r = (await actions.renameDepartment!(makeEvent({ id: 'a', name: '開発本部' }))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.name).toEqual({ code: 'nameConflict', field: 'name' });
	});

	it('DepartmentTreeError 以外は再 throw', async () => {
		renameDepartmentMock.mockRejectedValueOnce(new Error('boom'));
		await expect(actions.renameDepartment!(makeEvent({ id: 'a', name: 'X' }))).rejects.toThrow(
			'boom'
		);
	});
});

describe('?/deleteDepartment action (#241)', () => {
	beforeEach(() => {
		requireSessionMock.mockReset().mockResolvedValue({ teamId: 'team_default', userId: 'u1' });
		deleteDepartmentMock.mockReset().mockResolvedValue(undefined);
	});

	it('calls deleteDepartment(teamId, id) on valid id', async () => {
		const r = await actions.deleteDepartment!(makeEvent({ id: 'a' }));
		expect(deleteDepartmentMock).toHaveBeenCalledWith('team_default', 'a');
		expect(r).toMatchObject({ action: 'deleteDepartment', success: true });
	});

	it('fails 400 when id is missing', async () => {
		const r = (await actions.deleteDepartment!(makeEvent({}))) as { status: number };
		expect(r.status).toBe(400);
		expect(deleteDepartmentMock).not.toHaveBeenCalled();
	});
});
