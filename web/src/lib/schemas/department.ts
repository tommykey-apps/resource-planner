import { z } from 'zod';

/** Department 名の上限 (ADR 0013)。 UI maxlength と schema で共有。 */
export const DEPARTMENT_NAME_MAX_LENGTH = 100;

/**
 * 部署作成 (ADR 0013)。 #238 はフラット (parentId 省略 = ルート)。
 * `parentId` は #240 (子部署作成) で使う — 空文字 / 未指定はルート (undefined)、
 * repository 側で `?? null` に正規化する。
 */
export const departmentCreateSchema = z.object({
	name: z.string().min(1, 'required').max(DEPARTMENT_NAME_MAX_LENGTH, 'tooLong'),
	parentId: z.preprocess(
		(v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
		z.string().min(1, 'required').optional()
	)
});

export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;

/**
 * 部署の付け替え (#240)。 `parentId` 空文字 / 未指定 = ルート化 (undefined → action で null)。
 */
export const departmentMoveSchema = z.object({
	id: z.string().min(1, 'required'),
	parentId: z.preprocess(
		(v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
		z.string().min(1, 'required').optional()
	)
});

export type DepartmentMoveInput = z.infer<typeof departmentMoveSchema>;
