import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ServerError } from '$lib/shared/forms/server-error';
import { makeEntriesEvent, makeEvent } from '$lib/shared/forms/fake-action-event';

/** project の form actions。 repository / auth はモックし、 handler の引数 mapping + 戻り値だけを assert する。 */
const requireSessionMock = vi.fn();
const createProjectMock = vi.fn();
const updateProjectMock = vi.fn();
const deleteProjectMock = vi.fn();
const deleteProjectsMock = vi.fn();

vi.mock('$lib/features/auth/session.server', () => ({
	requireSession: (event: unknown) => requireSessionMock(event)
}));

vi.mock('./repository.server', () => ({
	createProject: (...args: unknown[]) => createProjectMock(...args),
	updateProject: (...args: unknown[]) => updateProjectMock(...args),
	deleteProject: (...args: unknown[]) => deleteProjectMock(...args),
	deleteProjects: (...args: unknown[]) => deleteProjectsMock(...args)
}));

import { projectActions as actions } from './actions.server';

const SESSION = { teamId: 'team_default', userId: 'u1' };

function resetAllMocks() {
	requireSessionMock.mockReset().mockResolvedValue(SESSION);
	createProjectMock.mockReset().mockResolvedValue(undefined);
	updateProjectMock.mockReset().mockResolvedValue(undefined);
	deleteProjectMock.mockReset().mockResolvedValue(undefined);
}

/**
 * #139: server から i18n 済文字列を返さない契約。 deleteResource / deleteProject /
 * deleteAssignment の id missing / startDate missing は { code, field } 形式で返ること
 * と、 zod 経由の error が { code: 'required' | 'tooLong' | ... } になることを固定する。
 */
describe('#139 server error wire format (code, no localized strings)', () => {
	beforeEach(() => {
		requireSessionMock.mockReset().mockResolvedValue({ teamId: 'team_default', userId: 'u1' });
	});

	it('deleteProject: id missing → { code: required, field: id }', async () => {
		const r = (await actions.deleteProject!(makeEvent({}))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.id).toEqual({ code: 'required', field: 'id' });
	});

	it('createProject: 不正 color → { code: invalidColorFormat, field: color }', async () => {
		const r = (await actions.createProject!(makeEvent({ name: 'P', color: 'red' }))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.color).toEqual({
			code: 'invalidColorFormat',
			field: 'color'
		});
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
		const r = (await actions.createProject!(makeEvent({ name: 'X', color: 'red' }))) as {
			status: number;
			data: { errors: Record<string, ServerError> };
		};
		expect(r.status).toBe(400);
		expect(r.data.errors.color).toBeTruthy();
		expect(createProjectMock).not.toHaveBeenCalled();
	});

	it('passes description / tags / linksJson from form (PR-N3, refs #187)', async () => {
		await actions.createProject!(
			makeEvent({
				name: 'Alpha',
				color: '#0EA5E9',
				description: 'detail body markdown',
				tags: 'TypeScript, AWS',
				linksJson: JSON.stringify([{ url: 'https://example.com', label: 'Wiki' }])
			})
		);
		expect(createProjectMock).toHaveBeenCalledWith('team_default', {
			name: 'Alpha',
			color: '#0EA5E9',
			description: 'detail body markdown',
			tags: ['TypeScript', 'AWS'],
			links: [{ url: 'https://example.com', label: 'Wiki' }]
		});
	});

	it('treats empty-string description as undefined (preprocess + ADR 0010 REMOVE semantics)', async () => {
		await actions.createProject!(
			makeEvent({ name: 'X', color: '#0EA5E9', description: '', tags: '', linksJson: '[]' })
		);
		expect(createProjectMock).toHaveBeenCalledWith(
			'team_default',
			expect.objectContaining({
				description: undefined,
				tags: [],
				links: []
			})
		);
	});
});

describe('?/updateProject action', () => {
	beforeEach(resetAllMocks);

	it('calls updateProject(teamId, { id, name, color, ...empty detail })', async () => {
		await actions.updateProject!(makeEvent({ id: 'p1', name: 'Beta', color: '#10B981' }));
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

	it('passes description / tags / linksJson from form (PR-N3, refs #187)', async () => {
		await actions.updateProject!(
			makeEvent({
				id: 'p1',
				name: 'Beta',
				color: '#10B981',
				description: 'updated body',
				tags: 'rust, k8s',
				linksJson: JSON.stringify([{ url: 'https://example.com/spec', label: 'Spec' }])
			})
		);
		expect(updateProjectMock).toHaveBeenCalledWith('team_default', {
			id: 'p1',
			name: 'Beta',
			color: '#10B981',
			description: 'updated body',
			tags: ['rust', 'k8s'],
			links: [{ url: 'https://example.com/spec', label: 'Spec' }]
		});
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

describe('?/deleteProjects action (一括削除)', () => {
	beforeEach(() => {
		resetAllMocks();
		deleteProjectsMock.mockReset();
	});

	it('繰り返した ids をまとめて deleteProjects(teamId, ids) に渡す', async () => {
		deleteProjectsMock.mockResolvedValue({ deleted: ['p1'], failed: [] });
		await actions.deleteProjects!(makeEntriesEvent([['ids', 'p1']]));
		expect(deleteProjectsMock).toHaveBeenCalledWith('team_default', ['p1']);
	});
});
