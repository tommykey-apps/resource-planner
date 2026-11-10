/**
 * メンバー画面 (/resources) の form actions。
 *
 * #171: ボイラープレート (requireSession → formData → safeParse → fail / run) は
 * `makeFormAction` helper に集約。 delete 系は `deleteByIdSchema` で zod 経由に揃える (#179)。
 */
import { fail, type Actions } from '@sveltejs/kit';
import { bulkIdsSchema, deleteByIdSchema } from '$lib/shared/forms/schema-primitives';
import { bulkDeleteResult, readBulkInput } from '$lib/shared/table/bulk-action.server';
import { makeFormAction } from '$lib/features/auth/form-action.server';
import { resourceCreateSchema, resourceUpdateSchema, resourcesMoveSchema } from './schema';
import {
	BulkTargetMissingError,
	ResourceEmailConflictError,
	createResource,
	deleteResource,
	deleteResources,
	moveResourcesToDepartment,
	updateResource
} from './repository.server';

/** ResourceEmailConflictError を ServerErrors wire format (#179) の fail(400) に map する (ADR 0015)。 */
function emailConflictFail(action: string) {
	return fail(400, { action, errors: { email: { code: 'emailConflict', field: 'email' } } });
}

export const resourceActions = {
	createResource: makeFormAction({
		action: 'createResource',
		schema: resourceCreateSchema,
		// #121: 作成された entity を返して optimistic UI の temp → real swap を可能にする。
		run: async (session, parsed) => {
			try {
				return { resource: await createResource(session.teamId, parsed) };
			} catch (e) {
				if (e instanceof ResourceEmailConflictError) return emailConflictFail('createResource');
				throw e;
			}
		}
	}),

	updateResource: makeFormAction({
		action: 'updateResource',
		schema: resourceUpdateSchema,
		run: async (session, parsed) => {
			try {
				await updateResource(session.teamId, parsed);
			} catch (e) {
				if (e instanceof ResourceEmailConflictError) return emailConflictFail('updateResource');
				throw e;
			}
		}
	}),

	deleteResource: makeFormAction({
		action: 'deleteResource',
		schema: deleteByIdSchema,
		run: async (session, parsed) => {
			await deleteResource(session.teamId, parsed.id);
		}
	}),

	deleteResources: makeFormAction({
		action: 'deleteResources',
		schema: bulkIdsSchema,
		readInput: readBulkInput,
		run: async (session, parsed) =>
			bulkDeleteResult(await deleteResources(session.teamId, parsed.ids))
	}),

	moveResources: makeFormAction({
		action: 'moveResources',
		schema: resourcesMoveSchema,
		readInput: readBulkInput,
		run: async (session, parsed) => {
			try {
				await moveResourcesToDepartment(session.teamId, parsed.ids, parsed.departmentId);
			} catch (e) {
				// 削除済みのメンバーが混ざっていた。 トランザクションごと取り消されて誰も変わっていない。
				if (e instanceof BulkTargetMissingError) {
					return fail(409, { errors: { ids: { code: 'notFound', field: 'ids' } } });
				}
				throw e;
			}
			return { moved: parsed.ids.length };
		}
	})
} satisfies Actions;
