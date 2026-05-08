import { z } from 'zod';
import { addDays } from '$lib/date';

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

/**
 * Assignment スキーマは **フォーム入力 (inclusive `endDate`) → ストレージ (exclusive `endDateExclusive`)** の
 * 変換を `.transform()` 内に閉じ込める (ADR 0004)。フォーム送信から repository まで、
 * 他の場所には `±1 day` が一切現れない設計。
 *
 * - `z.input<typeof schema>`: フォーム生 shape (`endDate` inclusive)
 * - `z.output<typeof schema>` (= `z.infer`): post-transform shape (`endDateExclusive`)
 */

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
	})
	.transform((input) => ({
		resourceId: input.resourceId,
		projectId: input.projectId,
		startDate: input.startDate,
		endDateExclusive: addDays(input.endDate, 1)
	}));

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
	})
	.transform((input) => ({
		id: input.id,
		resourceId: input.resourceId,
		projectId: input.projectId,
		startDate: input.startDate,
		endDateExclusive: addDays(input.endDate, 1)
	}));

/** フォーム生 shape (UX inclusive)。`+page.svelte` のフォームバインディングで使う。 */
export type AssignmentCreateInput = z.input<typeof assignmentCreateSchema>;
export type AssignmentUpdateInput = z.input<typeof assignmentUpdateSchema>;

/** Post-transform shape (storage)。repository が受け取る型。 */
export type AssignmentCreatePayload = z.output<typeof assignmentCreateSchema>;
export type AssignmentUpdatePayload = z.output<typeof assignmentUpdateSchema>;
