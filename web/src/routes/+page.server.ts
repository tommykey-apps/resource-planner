/**
 * Home (/) の form actions。
 *
 * #171: 9 form action のボイラープレート (requireSession → formData → safeParse → fail / run) を
 * `makeFormAction` helper に集約。 188 → ~75 行。 delete 系の `typeof id !== 'string'` 手書き
 * チェックは `deleteByIdSchema` / `deleteAssignmentSchema` で zod 経由に揃え、 ServerErrors
 * wire format を form action と API endpoint で統一 (#179 と整合)。
 */
import {
	assignmentCreateSchema,
	assignmentFormUpdateSchema,
	deleteAssignmentSchema,
	deleteByIdSchema,
	projectCreateSchema,
	projectUpdateSchema,
	resourceCreateSchema,
	resourceUpdateSchema
} from '$lib/schemas';
import {
	createAssignment,
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

	createAssignment: makeFormAction({
		action: 'createAssignment',
		schema: assignmentCreateSchema,
		// assignmentCreateSchema は refine + transform 済 (ADR 0004 endDateExclusive)。
		run: async (session, parsed) => {
			await createAssignment(session.teamId, parsed);
		}
	}),

	// SK = ASN#{startDate}#{id}: startDate 変更時は旧 SK Delete + 新 SK Put (assignment.ts 参照)。
	updateAssignment: makeFormAction({
		action: 'updateAssignment',
		schema: assignmentFormUpdateSchema,
		run: async (session, parsed) => {
			await updateAssignment(session.teamId, parsed.prevStartDate, parsed.payload);
		}
	}),

	// SK = ASN#{startDate}#{id} で構成されるため startDate も必要 (UC-05 / ADR 0005)。
	deleteAssignment: makeFormAction({
		action: 'deleteAssignment',
		schema: deleteAssignmentSchema,
		run: async (session, parsed) => {
			await deleteAssignment(session.teamId, parsed.startDate, parsed.id);
		}
	})
};
