/**
 * 予定の form actions。 作成・更新はタイムライン (/) と予定一覧 (/assignments) の両方、
 * 削除は予定一覧だけで使う。
 *
 * updateAssignment だけは ADR 0012 の version 楽観ロック競合を `fail(409, { conflict })` に
 * map する必要があるため makeFormAction を使わず専用実装にしている。
 */
import { fail, type Actions } from '@sveltejs/kit';
import { deleteByIdSchema } from '$lib/shared/forms/schema-primitives';
import { formatZodErrors } from '$lib/shared/forms/server-error';
import { makeFormAction } from '$lib/features/auth/form-action.server';
import { requireSession } from '$lib/features/auth/session.server';
import { assignmentCreateSchema, assignmentFormUpdateSchema } from './schema';
import {
	AssignmentVersionConflictError,
	createAssignment,
	deleteAssignment,
	updateAssignment
} from './repository.server';

/** 予定の作成と更新。 AssignmentCreator / AssignmentEditor を置く画面が公開する。 */
export const assignmentEditActions = {
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
	}
} satisfies Actions;

/** 予定の削除。 予定一覧 (/assignments) の行から使う。 */
export const assignmentDeleteActions = {
	// ADR 0012: SK = ASN#{id} になったため delete は id のみ (旧: startDate 込み)。
	deleteAssignment: makeFormAction({
		action: 'deleteAssignment',
		schema: deleteByIdSchema,
		run: async (session, parsed) => {
			await deleteAssignment(session.teamId, parsed.id);
		}
	})
} satisfies Actions;
