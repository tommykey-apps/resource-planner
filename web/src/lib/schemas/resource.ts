import { z } from 'zod';
import { bulkIdsSchema } from './shared';

// ── Resource ────────────────────────────────────────────────────────

export const resourceCreateSchema = z.object({
	name: z.string().min(1, 'required').max(100, 'tooLong'),
	// #239: 所属 Department。 空文字 / 未指定 = 未所属 (undefined → repository で attribute REMOVE)。
	departmentId: z.preprocess(
		(v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
		z.string().min(1, 'required').optional()
	)
});

export const resourceUpdateSchema = resourceCreateSchema.extend({
	id: z.string().min(1, 'required')
});

export type ResourceCreateInput = z.infer<typeof resourceCreateSchema>;
export type ResourceUpdateInput = z.infer<typeof resourceUpdateSchema>;

/** 選んだメンバーの所属部署を一括で変える。 空の departmentId は未所属 (attribute REMOVE)。 */
export const resourcesMoveSchema = bulkIdsSchema.extend({
	departmentId: resourceCreateSchema.shape.departmentId
});

export type ResourcesMoveInput = z.infer<typeof resourcesMoveSchema>;
