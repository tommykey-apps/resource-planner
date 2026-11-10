import { m } from '$lib/shared/i18n/paraglide/messages.js';
import type { Department } from '@resource-planner/db/entities';

/**
 * 部署の削除の確認文 (#241 / ADR 0016)。
 * 子部署と所属メンバーは親へ繰り上がる (ADR 0013) ので移動先を示す。 親が見つからなければ
 * (ルート / dangling 親) 「最上位・未所属」 の文にする (server も dangling 親はルートに正規化する)。
 * 直接属する案件があれば、 案件は未所属になること (消えはしないこと) を足す。
 */
export function departmentDeleteMessage(
	dept: Department,
	departments: Department[],
	projectCount: number
): string {
	const parent = dept.parentId ? departments.find((d) => d.id === dept.parentId) : undefined;
	const base = parent
		? m.departments_confirmDelete({ name: dept.name, parent: parent.name })
		: m.departments_confirmDeleteRoot({ name: dept.name });
	if (projectCount === 0) return base;
	return `${base}\n${m.departments_confirmDeleteProjects({ count: projectCount })}`;
}
