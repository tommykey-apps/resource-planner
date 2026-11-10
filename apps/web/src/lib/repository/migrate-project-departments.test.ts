import { describe, expect, it } from 'vitest';
// scripts/ の one-off 移行スクリプトの純粋ロジックを検証する (ADR 0016)。
import { planProjectDepartments } from '../../../scripts/migrate-project-departments.mjs';

const resources = [
	{ id: 'r1', departmentId: 'd1' },
	{ id: 'r2', departmentId: 'd1' },
	{ id: 'r3', departmentId: 'd2' },
	{ id: 'r4' } // 未所属
];
const asn = (projectId: string, resourceId: string) => ({ projectId, resourceId });

describe('planProjectDepartments (ADR 0016)', () => {
	it('割り当てられたメンバーの部署で最も多いものを入れる (1 割り当て 1 票)', () => {
		const { assign } = planProjectDepartments(
			[{ id: 'p1', name: 'A' }],
			[asn('p1', 'r1'), asn('p1', 'r2'), asn('p1', 'r3')],
			resources
		);
		expect(assign).toEqual([
			{ projectId: 'p1', name: 'A', departmentId: 'd1', votes: 2, total: 3 }
		]);
	});

	it('同じメンバーの割り当てが複数あれば、 その数だけ数える', () => {
		const { assign } = planProjectDepartments(
			[{ id: 'p1', name: 'A' }],
			[asn('p1', 'r3'), asn('p1', 'r3'), asn('p1', 'r1')],
			resources
		);
		expect(assign[0].departmentId).toBe('d2');
	});

	it('未所属のメンバーは数えない', () => {
		const { assign } = planProjectDepartments(
			[{ id: 'p1', name: 'A' }],
			[asn('p1', 'r4'), asn('p1', 'r4'), asn('p1', 'r3')],
			resources
		);
		expect(assign[0].departmentId).toBe('d2');
	});

	it('同数で並んだら入れずに、 決まらない案件として返す', () => {
		const { assign, undecided } = planProjectDepartments(
			[{ id: 'p1', name: 'A' }],
			[asn('p1', 'r1'), asn('p1', 'r3')],
			resources
		);
		expect(assign).toEqual([]);
		expect(undecided).toEqual([{ projectId: 'p1', name: 'A', reason: 'tie' }]);
	});

	it('割り当てが 0 件なら決まらない', () => {
		const { undecided } = planProjectDepartments([{ id: 'p1', name: 'A' }], [], resources);
		expect(undecided).toEqual([{ projectId: 'p1', name: 'A', reason: 'noAssignments' }]);
	});

	it('割り当てられた全員が未所属なら決まらない', () => {
		const { undecided } = planProjectDepartments(
			[{ id: 'p1', name: 'A' }],
			[asn('p1', 'r4')],
			resources
		);
		expect(undecided).toEqual([{ projectId: 'p1', name: 'A', reason: 'noDepartment' }]);
	});

	it('部署が入っている案件は対象外 (何度実行しても同じ結果)', () => {
		const { assign, undecided } = planProjectDepartments(
			[{ id: 'p1', name: 'A', departmentId: 'd9' }],
			[asn('p1', 'r1')],
			resources
		);
		expect(assign).toEqual([]);
		expect(undecided).toEqual([]);
	});
});
