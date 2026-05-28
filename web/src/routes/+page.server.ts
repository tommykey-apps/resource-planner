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
	deleteByIdSchema,
	projectCreateSchema,
	projectUpdateSchema,
	resourceCreateSchema,
	resourceUpdateSchema
} from '$lib/schemas';
import {
	AssignmentVersionConflictError,
	createAssignment,
	createDepartment,
	createProject,
	createResource,
	deleteAssignment,
	deleteProject,
	deleteResource,
	updateAssignment,
	updateProject,
	updateResource
} from '$lib/repository';
import { makeFormAction } from '$lib/forms/make-form-action';
import { requireSession } from '$lib/session';
import { formatZodErrors } from '$lib/forms/server-error';
import type { Actions } from './$types';

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

	// ADR 0013 / #238: 部署作成 (フラット = parentId 省略でルート)。 ツリー/編集/削除は後続 issue。
	createDepartment: makeFormAction({
		action: 'createDepartment',
		schema: departmentCreateSchema,
		run: async (session, parsed) => {
			await createDepartment(session.teamId, parsed);
		}
	}),

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
