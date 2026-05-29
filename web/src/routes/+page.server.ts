/**
 * Home (/) の form actions。
 *
 * #171: 9 form action のボイラープレート (requireSession → formData → safeParse → fail / run) を
 * `makeFormAction` helper に集約。 delete 系の `typeof id !== 'string'` 手書きチェックは
 * `deleteByIdSchema` で zod 経由に揃え、 ServerErrors wire format を統一 (#179)。
 *
 * updateAssignment だけは ADR 0012 の version 楽観ロック競合を `fail(409, { conflict })` に
 * map する必要があるため makeFormAction を使わず専用実装にしている。
 */
import { fail } from '@sveltejs/kit';
import {
	assignmentCreateSchema,
	assignmentFormUpdateSchema,
	departmentCreateSchema,
	departmentMoveSchema,
	deleteByIdSchema,
	projectCreateSchema,
	projectUpdateSchema,
	resourceCreateSchema,
	resourceUpdateSchema
} from '$lib/schemas';
import {
	AssignmentVersionConflictError,
	DepartmentTreeError,
	createAssignment,
	createDepartment,
	createProject,
	createResource,
	deleteAssignment,
	deleteProject,
	deleteResource,
	moveDepartment,
	updateAssignment,
	updateProject,
	updateResource
} from '$lib/repository';
import { makeFormAction } from '$lib/forms/make-form-action';
import { requireSession } from '$lib/session';
import { formatZodErrors } from '$lib/forms/server-error';
import type { Actions } from './$types';

/** DepartmentTreeError を ServerErrors wire format (#179) の fail(400) に map する (#240)。 */
function departmentTreeFail(action: string, e: DepartmentTreeError) {
	// nameConflict は name フィールド、 cycle / parentNotFound / notFound は parentId フィールドに紐づける。
	const field = e.code === 'nameConflict' ? 'name' : 'parentId';
	return fail(400, { action, errors: { [field]: { code: e.code, field } } });
}

export const actions: Actions = {
	createResource: makeFormAction({
		action: 'createResource',
		schema: resourceCreateSchema,
		// #121: 作成された entity を返して optimistic UI の temp → real swap を可能にする。
		run: async (session, parsed) => ({ resource: await createResource(session.teamId, parsed) })
	}),

	updateResource: makeFormAction({
		action: 'updateResource',
		schema: resourceUpdateSchema,
		run: async (session, parsed) => {
			await updateResource(session.teamId, parsed);
		}
	}),

	deleteResource: makeFormAction({
		action: 'deleteResource',
		schema: deleteByIdSchema,
		run: async (session, parsed) => {
			await deleteResource(session.teamId, parsed.id);
		}
	}),

	createProject: makeFormAction({
		action: 'createProject',
		schema: projectCreateSchema,
		run: async (session, parsed) => {
			await createProject(session.teamId, parsed);
		}
	}),

	updateProject: makeFormAction({
		action: 'updateProject',
		schema: projectUpdateSchema,
		run: async (session, parsed) => {
			await updateProject(session.teamId, parsed);
		}
	}),

	deleteProject: makeFormAction({
		action: 'deleteProject',
		schema: deleteByIdSchema,
		run: async (session, parsed) => {
			await deleteProject(session.teamId, parsed.id);
		}
	}),

	// ADR 0013: 部署作成。 兄弟名一意 / 親存在 (#240) を DepartmentTreeError → fail(400) に map する
	// ため makeFormAction を使わず専用実装。
	createDepartment: async (event) => {
		const session = await requireSession(event);
		const input = Object.fromEntries(await event.request.formData());
		const parsed = departmentCreateSchema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { action: 'createDepartment', errors: formatZodErrors(parsed) });
		}
		try {
			await createDepartment(session.teamId, parsed.data);
		} catch (e) {
			if (e instanceof DepartmentTreeError) return departmentTreeFail('createDepartment', e);
			throw e;
		}
		return { action: 'createDepartment', success: true };
	},

	// ADR 0013 / #240: 部署の付け替え (循環 / 兄弟名衝突 / 親不在を DepartmentTreeError → fail)。
	moveDepartment: async (event) => {
		const session = await requireSession(event);
		const input = Object.fromEntries(await event.request.formData());
		const parsed = departmentMoveSchema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { action: 'moveDepartment', errors: formatZodErrors(parsed) });
		}
		try {
			await moveDepartment(session.teamId, parsed.data.id, parsed.data.parentId ?? null);
		} catch (e) {
			if (e instanceof DepartmentTreeError) return departmentTreeFail('moveDepartment', e);
			throw e;
		}
		return { action: 'moveDepartment', success: true };
	},

	createAssignment: makeFormAction({
		action: 'createAssignment',
		schema: assignmentCreateSchema,
		// assignmentCreateSchema は refine + transform 済 (ADR 0004 endDateExclusive)。
		run: async (session, parsed) => {
			await createAssignment(session.teamId, parsed);
		}
	}),

	// ADR 0012: SK = ASN#{id} 安定キー + version 楽観ロック。 startDate を変えても SK 再構築は不要。
	// makeFormAction は run の throw を catch しないため、 version 競合を 409 に map する都合で専用実装。
	updateAssignment: async (event) => {
		const session = await requireSession(event);
		const input = Object.fromEntries(await event.request.formData());
		const parsed = assignmentFormUpdateSchema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { action: 'updateAssignment', errors: formatZodErrors(parsed) });
		}
		try {
			await updateAssignment(session.teamId, parsed.data);
		} catch (e) {
			if (e instanceof AssignmentVersionConflictError) {
				return fail(409, { action: 'updateAssignment', conflict: true });
			}
			throw e;
		}
		return { action: 'updateAssignment', success: true };
	},

	// ADR 0012: SK = ASN#{id} になったため delete は id のみ (旧: startDate 込み)。
	deleteAssignment: makeFormAction({
		action: 'deleteAssignment',
		schema: deleteByIdSchema,
		run: async (session, parsed) => {
			await deleteAssignment(session.teamId, parsed.id);
		}
	})
};
