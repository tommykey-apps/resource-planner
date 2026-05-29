import type { Department, Resource } from '$lib/types';

/**
 * adjacency-list ツリーの整合性検証 (ADR 0013、 純粋関数 = テスト容易)。
 *
 * repository が読み込んだ **同一 Team の全 Department** を渡して使う。 組織ツリーは小さい
 * (数十ノード) ため in-memory 走査で十分 (GSI/materialized path は導入しない)。
 */

/** `id` の全子孫の id 集合を返す (自分自身は含まない)。 */
export function descendantIds(departments: Department[], id: string): Set<string> {
	const childrenByParent = new Map<string, string[]>();
	for (const d of departments) {
		if (d.parentId == null) continue;
		const list = childrenByParent.get(d.parentId);
		if (list) list.push(d.id);
		else childrenByParent.set(d.parentId, [d.id]);
	}
	const result = new Set<string>();
	const stack = [...(childrenByParent.get(id) ?? [])];
	while (stack.length > 0) {
		const cur = stack.pop()!;
		if (result.has(cur)) continue; // 念のための無限ループ防止 (既存データが壊れていても止まる)
		result.add(cur);
		for (const child of childrenByParent.get(cur) ?? []) stack.push(child);
	}
	return result;
}

/**
 * `id` を `newParentId` の下に移すと循環になるか。
 * - newParentId === id (自分自身を親に) → cycle
 * - newParentId が id の子孫 → cycle
 * - newParentId === null (ルート化) → OK
 */
export function wouldCreateCycle(
	departments: Department[],
	id: string,
	newParentId: string | null
): boolean {
	if (newParentId == null) return false;
	if (newParentId === id) return true;
	return descendantIds(departments, id).has(newParentId);
}

/**
 * `parentId` 配下に `name` の兄弟が既に居るか (兄弟内名前一意の判定)。
 * `excludeId` (rename/move 対象自身) は除外する。
 */
export function siblingNameConflict(
	departments: Department[],
	parentId: string | null,
	name: string,
	excludeId?: string
): boolean {
	return departments.some(
		(d) => d.parentId === parentId && d.name === name && d.id !== excludeId
	);
}

/**
 * ツリーを DFS で平坦化し `{ dept, depth }` 列にする (UI の indent 表示用)。
 * 各階層は名前順。 親が存在しない (dangling) ノードはルート扱いで必ず出力する
 * (どのノードも一覧から消えないように)。
 */
export function flattenDepartmentTree(
	departments: Department[]
): { dept: Department; depth: number }[] {
	const knownIds = new Set(departments.map((d) => d.id));
	const childrenByParent = new Map<string | null, Department[]>();
	for (const d of departments) {
		const key = d.parentId && knownIds.has(d.parentId) ? d.parentId : null;
		const list = childrenByParent.get(key);
		if (list) list.push(d);
		else childrenByParent.set(key, [d]);
	}
	for (const list of childrenByParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));

	const out: { dept: Department; depth: number }[] = [];
	const visit = (parentId: string | null, depth: number) => {
		for (const d of childrenByParent.get(parentId) ?? []) {
			out.push({ dept: d, depth });
			visit(d.id, depth + 1);
		}
	};
	visit(null, 0);
	return out;
}

/** 部署フィルタの「未所属」を表す sentinel (URL param 値)。 実 id (ULID) とは衝突しない。 */
export const DEPARTMENT_FILTER_UNASSIGNED = '__unassigned__';

/**
 * 部署フィルタ (子孫含む) にマッチする Resource id 集合 (#242)。 timeline / assignments で共用。
 * - `''` (フィルタなし) → `null` (呼び出し側はフィルタをスキップ)
 * - `DEPARTMENT_FILTER_UNASSIGNED` → 部署未所属の Resource
 * - 部署 id → その部署 **+ 全子孫** に所属する Resource (in-memory 子孫展開、 DB 追加クエリなし)
 */
export function resourceIdsForDepartmentFilter(
	departments: Department[],
	resources: Resource[],
	departmentId: string
): Set<string> | null {
	if (!departmentId) return null;
	if (departmentId === DEPARTMENT_FILTER_UNASSIGNED) {
		return new Set(resources.filter((r) => !r.departmentId).map((r) => r.id));
	}
	const subtree = new Set<string>([departmentId, ...descendantIds(departments, departmentId)]);
	return new Set(
		resources.filter((r) => r.departmentId != null && subtree.has(r.departmentId)).map((r) => r.id)
	);
}
