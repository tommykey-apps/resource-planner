import {
	DEPARTMENT_FILTER_ALL,
	DEPARTMENT_FILTER_UNASSIGNED
} from '$lib/repository/department-tree';
import type { Resource } from '$lib/types';

/**
 * 部署プルダウンの初期値を、 ログインユーザーと照合したメンバーの部署にする (ADR 0015)。
 *
 * - 照合したメンバーに部署がある → その部署 id
 * - 照合したメンバーが未所属 → 未所属
 * - 照合できない (メンバー登録がまだない) → すべての部署
 *
 * メンバーのメールアドレスは保存時に小文字にそろえている。 ログイン側も Auth.js が小文字にするが、
 * 念のため同じ正規化をしてから比べる。
 */
export function defaultDepartmentFilter(
	resources: Resource[],
	email: string | null | undefined
): string {
	const key = email?.trim().toLowerCase();
	if (!key) return DEPARTMENT_FILTER_ALL;
	const me = resources.find((r) => r.email === key);
	if (!me) return DEPARTMENT_FILTER_ALL;
	return me.departmentId ?? DEPARTMENT_FILTER_UNASSIGNED;
}
