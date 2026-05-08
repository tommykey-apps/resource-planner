import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import {
	resourceCreateSchema,
	resourceUpdateSchema,
	projectCreateSchema,
	projectUpdateSchema,
	assignmentCreateSchema
} from '$lib/schemas';
import {
	createResource,
	updateResource,
	deleteResource,
	createProject,
	updateProject,
	deleteProject,
	createAssignment,
	deleteAssignment
} from '$lib/repository';
import type { Actions } from './$types';

/**
 * 認証 + Org 取得を共通化。
 *
 * `+layout.server.ts` で 403 を返している前提だが、念のため form action 側でも
 * orgId を再取得する (action は layout の load を再評価しないことがある)。
 */
function requireOrg(locals: App.Locals): string {
	const auth = locals.auth();
	if (!auth.userId) error(401, '認証が必要です');
	if (!auth.orgId) error(403, '組織が選択されていません');
	return auth.orgId;
}

/**
 * Zod の formatted error を form action の戻り値に整形する。
 * `+page.svelte` 側で `form.errors.name` のようにアクセスできる。
 */
function formatErrors<T>(result: z.ZodSafeParseError<T>): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const issue of result.error.issues) {
		const key = issue.path.join('.');
		if (key && !errors[key]) errors[key] = issue.message;
	}
	return errors;
}

export const actions: Actions = {
	createResource: async ({ request, locals }) => {
		const orgId = requireOrg(locals);
		const data = await request.formData();
		const parsed = resourceCreateSchema.safeParse({
			name: data.get('name')
		});
		if (!parsed.success) {
			return fail(400, {
				action: 'createResource',
				errors: formatErrors(parsed)
			});
		}
		await createResource(orgId, parsed.data);
		return { action: 'createResource', success: true };
	},

	updateResource: async ({ request, locals }) => {
		const orgId = requireOrg(locals);
		const data = await request.formData();
		const parsed = resourceUpdateSchema.safeParse({
			id: data.get('id'),
			name: data.get('name')
		});
		if (!parsed.success) {
			return fail(400, {
				action: 'updateResource',
				errors: formatErrors(parsed)
			});
		}
		await updateResource(orgId, parsed.data);
		return { action: 'updateResource', success: true };
	},

	deleteResource: async ({ request, locals }) => {
		const orgId = requireOrg(locals);
		const data = await request.formData();
		const id = data.get('id');
		if (typeof id !== 'string' || !id) {
			return fail(400, {
				action: 'deleteResource',
				errors: { id: 'id が必要です' }
			});
		}
		// cascade delete (関連 Assignment も削除) は PR-H で実装予定。
		// 現状は Resource 単体のみ削除するため、関連 Assignment は orphan として残る。
		await deleteResource(orgId, id);
		return { action: 'deleteResource', success: true };
	},

	createProject: async ({ request, locals }) => {
		const orgId = requireOrg(locals);
		const data = await request.formData();
		const parsed = projectCreateSchema.safeParse({
			name: data.get('name'),
			color: data.get('color')
		});
		if (!parsed.success) {
			return fail(400, {
				action: 'createProject',
				errors: formatErrors(parsed)
			});
		}
		await createProject(orgId, parsed.data);
		return { action: 'createProject', success: true };
	},

	updateProject: async ({ request, locals }) => {
		const orgId = requireOrg(locals);
		const data = await request.formData();
		const parsed = projectUpdateSchema.safeParse({
			id: data.get('id'),
			name: data.get('name'),
			color: data.get('color')
		});
		if (!parsed.success) {
			return fail(400, {
				action: 'updateProject',
				errors: formatErrors(parsed)
			});
		}
		await updateProject(orgId, parsed.data);
		return { action: 'updateProject', success: true };
	},

	deleteProject: async ({ request, locals }) => {
		const orgId = requireOrg(locals);
		const data = await request.formData();
		const id = data.get('id');
		if (typeof id !== 'string' || !id) {
			return fail(400, {
				action: 'deleteProject',
				errors: { id: 'id が必要です' }
			});
		}
		// cascade delete は PR-H で実装予定。現状は orphan を残す。
		await deleteProject(orgId, id);
		return { action: 'deleteProject', success: true };
	},

	createAssignment: async ({ request, locals }) => {
		const orgId = requireOrg(locals);
		const data = await request.formData();
		const parsed = assignmentCreateSchema.safeParse({
			resourceId: data.get('resourceId'),
			projectId: data.get('projectId'),
			startDate: data.get('startDate'),
			endDate: data.get('endDate')
		});
		if (!parsed.success) {
			return fail(400, {
				action: 'createAssignment',
				errors: formatErrors(parsed)
			});
		}
		// assignmentCreateSchema は startDate <= endDate を refine 検証済 (inclusive)。
		// .transform() で endDateExclusive へ変換 (ADR 0004)。
		// SK は ASN#{startDate}#{ulid()} で時系列順にソートされる。
		await createAssignment(orgId, parsed.data);
		return { action: 'createAssignment', success: true };
	},

	deleteAssignment: async ({ request, locals }) => {
		const orgId = requireOrg(locals);
		const data = await request.formData();
		const id = data.get('id');
		const startDate = data.get('startDate');
		if (typeof id !== 'string' || !id) {
			return fail(400, { action: 'deleteAssignment', errors: { id: 'id が必要です' } });
		}
		if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
			return fail(400, {
				action: 'deleteAssignment',
				errors: { startDate: 'startDate が必要です (YYYY-MM-DD)' }
			});
		}
		// SK = ASN#{startDate}#{id} で構成されるため startDate も必要 (UC-05 / ADR 0005 参照)。
		await deleteAssignment(orgId, startDate, id);
		return { action: 'deleteAssignment', success: true };
	}
};
