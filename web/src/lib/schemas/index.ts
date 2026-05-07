import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で入力してください');

const colorString = z.string().regex(/^#[0-9a-fA-F]{6}$/, '#RRGGBB 形式で入力してください');

// ── Resource ────────────────────────────────────────────────────────

export const resourceCreateSchema = z.object({
	name: z.string().min(1, '必須').max(100, '100 文字以内')
});

export const resourceUpdateSchema = resourceCreateSchema.extend({
	id: z.string().min(1)
});

export type ResourceCreateInput = z.infer<typeof resourceCreateSchema>;
export type ResourceUpdateInput = z.infer<typeof resourceUpdateSchema>;

// ── Project ─────────────────────────────────────────────────────────

export const projectCreateSchema = z.object({
	name: z.string().min(1, '必須').max(100, '100 文字以内'),
	color: colorString
});

export const projectUpdateSchema = projectCreateSchema.extend({
	id: z.string().min(1)
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

// ── Assignment ──────────────────────────────────────────────────────

export const assignmentCreateSchema = z
	.object({
		resourceId: z.string().min(1),
		projectId: z.string().min(1),
		startDate: dateString,
		endDate: dateString
	})
	.refine((v) => v.startDate <= v.endDate, {
		message: '終了日は開始日以降にしてください',
		path: ['endDate']
	});

export const assignmentUpdateSchema = z
	.object({
		id: z.string().min(1),
		resourceId: z.string().min(1),
		projectId: z.string().min(1),
		startDate: dateString,
		endDate: dateString
	})
	.refine((v) => v.startDate <= v.endDate, {
		message: '終了日は開始日以降にしてください',
		path: ['endDate']
	});

export type AssignmentCreateInput = z.infer<typeof assignmentCreateSchema>;
export type AssignmentUpdateInput = z.infer<typeof assignmentUpdateSchema>;
