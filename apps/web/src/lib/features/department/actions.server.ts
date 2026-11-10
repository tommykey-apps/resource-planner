/**
 * 部署画面 (/departments) の form actions。
 *
 * 作成・付け替え・名前変更は、 兄弟名一意 / 親存在 / 循環 (#240) を DepartmentTreeError → fail(400) に
 * map するため makeFormAction を使わず専用実装にしている。
 */
import { fail, type Actions } from '@sveltejs/kit';
import { deleteByIdSchema } from '$lib/shared/forms/schema-primitives';
import { formatZodErrors } from '$lib/shared/forms/server-error';
import { makeFormAction } from '$lib/features/auth/form-action.server';
import { requireSession } from '$lib/features/auth/session.server';
import { departmentCreateSchema, departmentMoveSchema, departmentRenameSchema } from './schema';
import {
	DepartmentTreeError,
	createDepartment,
	deleteDepartment,
	moveDepartment,
	renameDepartment
} from './repository.server';

/** DepartmentTreeError を ServerErrors wire format (#179) の fail(400) に map する (#240)。 */
function departmentTreeFail(action: string, e: DepartmentTreeError) {
	// nameConflict は name フィールド、 cycle / parentNotFound / notFound は parentId フィールドに紐づける。
	const field = e.code === 'nameConflict' ? 'name' : 'parentId';
	return fail(400, { action, errors: { [field]: { code: e.code, field } } });
}

export const departmentActions = {
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

	// #250: 部署名の変更 (兄弟名衝突 / 対象不在を DepartmentTreeError → fail)。
	renameDepartment: async (event) => {
		const session = await requireSession(event);
		const input = Object.fromEntries(await event.request.formData());
		const parsed = departmentRenameSchema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { action: 'renameDepartment', errors: formatZodErrors(parsed) });
		}
		try {
			await renameDepartment(session.teamId, parsed.data.id, parsed.data.name);
		} catch (e) {
			if (e instanceof DepartmentTreeError) return departmentTreeFail('renameDepartment', e);
			throw e;
		}
		return { action: 'renameDepartment', success: true };
	},

	// ADR 0013 / #241: 部署削除 = 配下を親へ繰り上げ (reparent)。 ツリー検証不要なので makeFormAction で十分。
	deleteDepartment: makeFormAction({
		action: 'deleteDepartment',
		schema: deleteByIdSchema,
		run: async (session, parsed) => {
			await deleteDepartment(session.teamId, parsed.id);
		}
	})
} satisfies Actions;
