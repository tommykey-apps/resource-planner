import { z } from 'zod';

/** Department 名の上限 (ADR 0013)。 UI maxlength と schema で共有。 */
export const DEPARTMENT_NAME_MAX_LENGTH = 100;

/**
 * 部署作成 (ADR 0013)。 #238 はフラット (parentId 省略 = ルート)。
 * `parentId` は #240 (子部署作成) で使う — 空文字は undefined に正規化してルート扱い。
 */
export const departmentCreateSchema = z.object({
	name: z.string().min(1, 'required').max(DEPARTMENT_NAME_MAX_LENGTH, 'tooLong'),
	parentId: z.preprocess(
		(v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
		z.string().min(1, 'required').nullish()
	)
});

export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;
