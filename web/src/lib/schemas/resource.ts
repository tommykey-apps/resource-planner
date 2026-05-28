import { z } from 'zod';

// ── Resource ────────────────────────────────────────────────────────

export const resourceCreateSchema = z.object({
	name: z.string().min(1, 'required').max(100, 'tooLong')
});

export const resourceUpdateSchema = resourceCreateSchema.extend({
	id: z.string().min(1, 'required')
});

export type ResourceCreateInput = z.infer<typeof resourceCreateSchema>;
export type ResourceUpdateInput = z.infer<typeof resourceUpdateSchema>;
