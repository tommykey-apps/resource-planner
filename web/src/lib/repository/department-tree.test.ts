import { describe, expect, it } from 'vitest';
import {
	descendantIds,
	wouldCreateCycle,
	siblingNameConflict,
	flattenDepartmentTree,
	resourceIdsForDepartmentFilter,
	DEPARTMENT_FILTER_UNASSIGNED
} from './department-tree';
import type { Department, Resource } from '$lib/types';

/**
 * ADR 0013: adjacency-list ツリーの整合性検証 (純粋関数)。
 * move/create 時の循環防止・兄弟名一意をここで担保する (repository が読み込んだ全 department を渡す)。
 *
 * ツリー:
 *   root (r)
 *   ├─ a
 *   │  └─ a1
 *   └─ b
 *   solo (s) ← 別ルート (フォレスト)
 */
const deps: Department[] = [
	{ id: 'r', name: '開発本部', parentId: null },
	{ id: 'a', name: 'バックエンド課', parentId: 'r' },
	{ id: 'a1', name: 'API 班', parentId: 'a' },
	{ id: 'b', name: 'フロント課', parentId: 'r' },
	{ id: 's', name: '営業本部', parentId: null }
];

describe('descendantIds', () => {
	it('returns all descendants (not including self)', () => {
		expect(descendantIds(deps, 'r')).toEqual(new Set(['a', 'a1', 'b']));
		expect(descendantIds(deps, 'a')).toEqual(new Set(['a1']));
		expect(descendantIds(deps, 'a1')).toEqual(new Set());
		expect(descendantIds(deps, 's')).toEqual(new Set());
	});
});

describe('wouldCreateCycle', () => {
	it('rejects moving a node under itself', () => {
		expect(wouldCreateCycle(deps, 'a', 'a')).toBe(true);
	});
	it('rejects moving a node under its own descendant', () => {
		expect(wouldCreateCycle(deps, 'r', 'a1')).toBe(true);
		expect(wouldCreateCycle(deps, 'a', 'a1')).toBe(true);
	});
	it('allows moving to root (null)', () => {
		expect(wouldCreateCycle(deps, 'a', null)).toBe(false);
	});
	it('allows moving under a non-descendant', () => {
		expect(wouldCreateCycle(deps, 'a', 's')).toBe(false);
		expect(wouldCreateCycle(deps, 'b', 'a')).toBe(false);
	});
});

describe('siblingNameConflict', () => {
	it('true when a sibling under the same parent already has the name', () => {
		// r 配下に既に「バックエンド課」(a) がある
		expect(siblingNameConflict(deps, 'r', 'バックエンド課')).toBe(true);
	});
	it('false when name is unique among siblings', () => {
		expect(siblingNameConflict(deps, 'r', '新課')).toBe(false);
	});
	it('false when the conflicting node is excluded (self, rename/move 時)', () => {
		expect(siblingNameConflict(deps, 'r', 'バックエンド課', 'a')).toBe(false);
	});
	it('scopes by parent (同名でも親が違えば衝突しない)', () => {
		// root 直下の「営業本部」(s) と同名を a 配下に作るのは OK
		expect(siblingNameConflict(deps, 'a', '営業本部')).toBe(false);
	});
	it('handles root siblings (parentId null)', () => {
		expect(siblingNameConflict(deps, null, '開発本部')).toBe(true);
		expect(siblingNameConflict(deps, null, '管理本部')).toBe(false);
	});
});

describe('flattenDepartmentTree', () => {
	it('DFS 順 (親→子) + depth、 各階層は名前順', () => {
		// localeCompare 依存を避けるため ASCII 名で順序を決定的にする。
		const ascii: Department[] = [
			{ id: 'r', name: 'A-root', parentId: null },
			{ id: 'a', name: 'A-child', parentId: 'r' },
			{ id: 'a1', name: 'A-grand', parentId: 'a' },
			{ id: 'b', name: 'B-child', parentId: 'r' },
			{ id: 's', name: 'Z-root', parentId: null }
		];
		const flat = flattenDepartmentTree(ascii);
		expect(flat.map((f) => [f.dept.id, f.depth])).toEqual([
			['r', 0], // A-root
			['a', 1], // A-child
			['a1', 2], // A-grand
			['b', 1], // B-child
			['s', 0] // Z-root
		]);
	});

	it('親が存在しない (dangling) ノードはルート扱いで必ず出力する', () => {
		const orphan: Department[] = [{ id: 'x', name: '孤立課', parentId: 'ghost' }];
		const flat = flattenDepartmentTree(orphan);
		expect(flat).toEqual([{ dept: orphan[0], depth: 0 }]);
	});
});

describe('resourceIdsForDepartmentFilter (#242 部署フィルタ、 子孫含む)', () => {
	const resources: Resource[] = [
		{ id: 'u1', name: 'A', departmentId: 'a' },
		{ id: 'u2', name: 'B', departmentId: 'a1' },
		{ id: 'u3', name: 'C', departmentId: 'b' },
		{ id: 'u4', name: 'D', departmentId: 's' },
		{ id: 'u5', name: 'E' } // 未所属
	];

	it('空 (フィルタなし) は null を返す', () => {
		expect(resourceIdsForDepartmentFilter(deps, resources, '')).toBeNull();
	});

	it('部署を指定すると子孫部署の Resource も含む', () => {
		// r 配下 = a, a1, b → u1, u2, u3
		expect(resourceIdsForDepartmentFilter(deps, resources, 'r')).toEqual(
			new Set(['u1', 'u2', 'u3'])
		);
		// a 配下 = a, a1 → u1, u2
		expect(resourceIdsForDepartmentFilter(deps, resources, 'a')).toEqual(new Set(['u1', 'u2']));
		// 葉 s → u4
		expect(resourceIdsForDepartmentFilter(deps, resources, 's')).toEqual(new Set(['u4']));
	});

	it('未所属フィルタは departmentId なしの Resource を返す', () => {
		expect(resourceIdsForDepartmentFilter(deps, resources, DEPARTMENT_FILTER_UNASSIGNED)).toEqual(
			new Set(['u5'])
		);
	});

	it('存在しない部署 id は空集合 (該当なし)', () => {
		expect(resourceIdsForDepartmentFilter(deps, resources, 'ghost')).toEqual(new Set());
	});
});
