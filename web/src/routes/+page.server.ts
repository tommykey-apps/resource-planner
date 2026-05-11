import { fail } from '@sveltejs/kit';
import {
	resourceCreateSchema,
	resourceUpdateSchema,
	projectCreateSchema,
	projectUpdateSchema,
	assignmentCreateSchema,
	assignmentFormUpdateSchema
} from '$lib/schemas';
import {
	createResource,
	updateResource,
	deleteResource,
	createProject,
	updateProject,
	deleteProject,
	createAssignment,
	updateAssignment,
	deleteAssignment
} from '$lib/repository';
import { requireSession } from '$lib/auth';
import { formatZodErrors, type ServerError } from '$lib/forms/server-error';
import type { Actions } from './$types';

export const actions: Actions = {
	createResource: async (event) => {
		const session = await requireSession(event);
		const data = await event.request.formData();
		const parsed = resourceCreateSchema.safeParse({
			name: data.get('name')
		});
		if (!parsed.success) {
			return fail(400, {
				action: 'createResource',
				errors: formatZodErrors(parsed)
			});
		}
		// #121: 作成された entity を返して optimistic UI の temp → real swap を可能にする。
		const resource = await createResource(session.teamId, parsed.data);
		return { action: 'createResource', success: true, resource };
	},

	updateResource: async (event) => {
		const session = await requireSession(event);
		const data = await event.request.formData();
		const parsed = resourceUpdateSchema.safeParse({
			id: data.get('id'),
			name: data.get('name')
		});
		if (!parsed.success) {
			return fail(400, {
				action: 'updateResource',
				errors: formatZodErrors(parsed)
			});
		}
		await updateResource(session.teamId, parsed.data);
		return { action: 'updateResource', success: true };
	},

	deleteResource: async (event) => {
		const session = await requireSession(event);
		const data = await event.request.formData();
		const id = data.get('id');
		if (typeof id !== 'string' || !id) {
			const errors: Record<string, ServerError> = {
				id: { code: 'required', field: 'id' }
			};
			return fail(400, { action: 'deleteResource', errors });
		}
		await deleteResource(session.teamId, id);
		return { action: 'deleteResource', success: true };
	},

	createProject: async (event) => {
		const session = await requireSession(event);
		const data = await event.request.formData();
		const parsed = projectCreateSchema.safeParse({
			name: data.get('name'),
			color: data.get('color')
		});
		if (!parsed.success) {
			return fail(400, {
				action: 'createProject',
				errors: formatZodErrors(parsed)
			});
		}
		await createProject(session.teamId, parsed.data);
		return { action: 'createProject', success: true };
	},

	updateProject: async (event) => {
		const session = await requireSession(event);
		const data = await event.request.formData();
		const parsed = projectUpdateSchema.safeParse({
			id: data.get('id'),
			name: data.get('name'),
			color: data.get('color')
		});
		if (!parsed.success) {
			return fail(400, {
				action: 'updateProject',
				errors: formatZodErrors(parsed)
			});
		}
		await updateProject(session.teamId, parsed.data);
		return { action: 'updateProject', success: true };
	},

	deleteProject: async (event) => {
		const session = await requireSession(event);
		const data = await event.request.formData();
		const id = data.get('id');
		if (typeof id !== 'string' || !id) {
			const errors: Record<string, ServerError> = {
				id: { code: 'required', field: 'id' }
			};
			return fail(400, { action: 'deleteProject', errors });
		}
		await deleteProject(session.teamId, id);
		return { action: 'deleteProject', success: true };
	},

	createAssignment: async (event) => {
		const session = await requireSession(event);
		const data = await event.request.formData();
		const parsed = assignmentCreateSchema.safeParse({
			resourceId: data.get('resourceId'),
			projectId: data.get('projectId'),
			startDate: data.get('startDate'),
			endDate: data.get('endDate')
		});
		if (!parsed.success) {
			return fail(400, {
				action: 'createAssignment',
				errors: formatZodErrors(parsed)
			});
		}
		// assignmentCreateSchema は startDate <= endDate を refine 検証済 (inclusive)。
		// .transform() で endDateExclusive へ変換 (ADR 0004)。
		// SK は ASN#{startDate}#{ulid()} で時系列順にソートされる。
		await createAssignment(session.teamId, parsed.data);
		return { action: 'createAssignment', success: true };
	},

	updateAssignment: async (event) => {
		const session = await requireSession(event);
		const data = await event.request.formData();
		const parsed = assignmentFormUpdateSchema.safeParse({
			id: data.get('id'),
			resourceId: data.get('resourceId'),
			projectId: data.get('projectId'),
			prevStartDate: data.get('prevStartDate'),
			startDate: data.get('startDate'),
			endDate: data.get('endDate')
		});
		if (!parsed.success) {
			return fail(400, {
				action: 'updateAssignment',
				errors: formatZodErrors(parsed)
			});
		}
		// SK = ASN#{startDate}#{id}: startDate 変更時は旧 SK Delete + 新 SK Put (assignment.ts 参照)。
		await updateAssignment(session.teamId, parsed.data.prevStartDate, parsed.data.payload);
		return { action: 'updateAssignment', success: true };
	},

	deleteAssignment: async (event) => {
		const session = await requireSession(event);
		const data = await event.request.formData();
		const id = data.get('id');
		const startDate = data.get('startDate');
		if (typeof id !== 'string' || !id) {
			const errors: Record<string, ServerError> = {
				id: { code: 'required', field: 'id' }
			};
			return fail(400, { action: 'deleteAssignment', errors });
		}
		if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
			const errors: Record<string, ServerError> = {
				startDate: { code: 'invalidDateFormat', field: 'startDate' }
			};
			return fail(400, { action: 'deleteAssignment', errors });
		}
		// SK = ASN#{startDate}#{id} で構成されるため startDate も必要 (UC-05 / ADR 0005 参照)。
		await deleteAssignment(session.teamId, startDate, id);
		return { action: 'deleteAssignment', success: true };
	}
};
