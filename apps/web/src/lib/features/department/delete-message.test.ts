import { describe, expect, it } from 'vitest';
import { departmentDeleteMessage } from '$lib/features/department/delete-message';
import type { Department } from '@resource-planner/db/entities';

const DEPARTMENTS: Department[] = [
	{ id: 'd1', name: '開発本部', parentId: null },
	{ id: 'd2', name: 'バックエンド課', parentId: 'd1' }
];

describe('departmentDeleteMessage', () => {
	it('案件がなければ従来の文 (親へ移る)', () => {
		const msg = departmentDeleteMessage(DEPARTMENTS[1], DEPARTMENTS, 0);
		expect(msg).toContain('親の「開発本部」へ移ります');
		expect(msg).not.toContain('案件');
	});

	it('ルートで案件がなければ従来の文 (最上位・未所属)', () => {
		const msg = departmentDeleteMessage(DEPARTMENTS[0], DEPARTMENTS, 0);
		expect(msg).toContain('最上位');
		expect(msg).not.toContain('案件');
	});

	it('ADR 0016: 案件があれば件数と、 案件が消えずに紐付きだけがなくなることを足す', () => {
		const msg = departmentDeleteMessage(DEPARTMENTS[1], DEPARTMENTS, 2);
		expect(msg).toContain('親の「開発本部」へ移ります');
		expect(msg).toContain('紐づく案件が 2 件');
		expect(msg).toContain('案件そのものは消えず');
	});
});
