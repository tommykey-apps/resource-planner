import { z } from 'zod';
import { bulkIdsSchema, optionalDepartmentId } from '$lib/shared/forms/schema-primitives';

// ── Resource ────────────────────────────────────────────────────────

/** RFC 5321 4.5.3.1.3: メールアドレス (path) の上限は 256 octets、 `<>` を除いて 254。 */
const EMAIL_MAX = 254;

/**
 * ログインユーザーとメンバーを結び付けるキー (ADR 0015)。
 * Auth.js はログイン時にアドレスを小文字にして前後の空白を除く
 * (`@auth/core` `lib/actions/signin/send-token.js` の `defaultNormalizer`)。
 * 保存側も同じ正規化をしないと、 大文字を含めて登録したメンバーと照合できない。
 */
const memberEmail = z
	.string({ error: 'required' })
	.trim()
	.toLowerCase()
	.min(1, 'required')
	.max(EMAIL_MAX, 'tooLong')
	.pipe(z.email('invalidEmail'));

export const resourceCreateSchema = z.object({
	name: z.string().min(1, 'required').max(100, 'tooLong'),
	email: memberEmail,
	// #239: 所属 Department。 空文字 / 未指定 = 未所属 (undefined → repository で attribute REMOVE)。
	departmentId: optionalDepartmentId
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
