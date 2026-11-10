/**
 * 案件画面 (/projects) の form actions。
 *
 * #171: ボイラープレート (requireSession → formData → safeParse → fail / run) は
 * `makeFormAction` helper に集約。 delete 系は `deleteByIdSchema` で zod 経由に揃える (#179)。
 */
import type { Actions } from '@sveltejs/kit';
import { bulkIdsSchema, deleteByIdSchema } from '$lib/shared/forms/schema-primitives';
import { bulkDeleteResult, readBulkInput } from '$lib/shared/table/bulk-action.server';
import { makeFormAction } from '$lib/features/auth/form-action.server';
import { projectCreateSchema, projectUpdateSchema } from './schema';
import { createProject, deleteProject, deleteProjects, updateProject } from './repository.server';

export const projectActions = {
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

	deleteProjects: makeFormAction({
		action: 'deleteProjects',
		schema: bulkIdsSchema,
		readInput: readBulkInput,
		run: async (session, parsed) =>
			bulkDeleteResult(await deleteProjects(session.teamId, parsed.ids))
	})
} satisfies Actions;
