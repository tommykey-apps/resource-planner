import { describe, expect, it } from 'vitest';
import { defaultDepartmentFilter } from '$lib/features/department/default-filter';
import { DEPARTMENT_FILTER_ALL, DEPARTMENT_FILTER_UNASSIGNED } from '$lib/features/department/tree';
import type { Resource } from '@resource-planner/db/entities';

/**
 * 部署プルダウンの初期値 (ADR 0015)。 ログインユーザーのメールアドレスでメンバーを照合する。
 */
const RESOURCES: Resource[] = [
	{ id: 'r1', name: '冨永', email: 'tominaga@example.com', departmentId: 'd-be' },
	{ id: 'r2', name: '泉', email: 'izumi@example.com' }
];

describe('defaultDepartmentFilter', () => {
	it('照合したメンバーに部署があれば、 その部署', () => {
		expect(defaultDepartmentFilter(RESOURCES, 'tominaga@example.com')).toBe('d-be');
	});

	it('照合したメンバーが未所属なら、 未所属', () => {
		expect(defaultDepartmentFilter(RESOURCES, 'izumi@example.com')).toBe(
			DEPARTMENT_FILTER_UNASSIGNED
		);
	});

	it('照合できるメンバーがいなければ、 すべての部署', () => {
		expect(defaultDepartmentFilter(RESOURCES, 'nobody@example.com')).toBe(DEPARTMENT_FILTER_ALL);
	});

	it('メールアドレスがなければ、 すべての部署', () => {
		expect(defaultDepartmentFilter(RESOURCES, null)).toBe(DEPARTMENT_FILTER_ALL);
		expect(defaultDepartmentFilter(RESOURCES, undefined)).toBe(DEPARTMENT_FILTER_ALL);
		expect(defaultDepartmentFilter(RESOURCES, '')).toBe(DEPARTMENT_FILTER_ALL);
	});

	it('大文字と前後の空白の違いは無視する', () => {
		expect(defaultDepartmentFilter(RESOURCES, ' Tominaga@Example.COM ')).toBe('d-be');
	});
});
