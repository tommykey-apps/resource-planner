import {
	DynamoDBDocumentClient,
	PutCommand,
	QueryCommand,
	UpdateCommand,
	TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	createDepartment,
	moveDepartment,
	deleteDepartment,
	listDepartments,
	DepartmentTreeError
} from './department';

const ddbMock = mockClient(DynamoDBDocumentClient);
const TEAM = 'team-test';
const TABLE = process.env.DYNAMODB_TABLE ?? 'resource-planner-test';

/** listDepartments (Query begins_with DEPT#) が返す DDB item 群を mock する。 */
function mockDepartments(items: { id: string; name: string; parentId?: string }[]) {
	ddbMock.on(QueryCommand).resolves({
		Items: items.map((d) => ({
			pk: `TEAM#${TEAM}`,
			sk: `DEPT#${d.id}`,
			id: d.id,
			name: d.name,
			...(d.parentId ? { parentId: d.parentId } : {})
		}))
	});
}

beforeEach(() => {
	ddbMock.reset();
	mockDepartments([]); // default: 既存部署なし
	ddbMock.on(PutCommand).resolves({});
	ddbMock.on(UpdateCommand).resolves({});
});

describe('createDepartment (ADR 0013 / #240 validation)', () => {
	it('root: SK=DEPT#{id}, name 保存, attribute_not_exists, parentId 属性なし', async () => {
		const result = await createDepartment(TEAM, { name: '開発本部' });

		expect(result).toMatchObject({ name: '開発本部', parentId: null });
		const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
		expect(input.Item).toMatchObject({
			pk: `TEAM#${TEAM}`,
			sk: `DEPT#${result.id}`,
			id: result.id,
			name: '開発本部'
		});
		expect(input.Item).not.toHaveProperty('parentId');
		expect(input.ConditionExpression).toBe('attribute_not_exists(sk)');
	});

	it('child: 親が存在すれば parentId を属性保存', async () => {
		mockDepartments([{ id: 'p1', name: '開発本部' }]);
		const result = await createDepartment(TEAM, { name: 'バックエンド課', parentId: 'p1' });
		expect(result.parentId).toBe('p1');
		expect(ddbMock.commandCalls(PutCommand)[0].args[0].input.Item).toMatchObject({ parentId: 'p1' });
	});

	it('親が存在しない → DepartmentTreeError(parentNotFound)、 Put しない', async () => {
		mockDepartments([{ id: 'p1', name: '開発本部' }]);
		await expect(
			createDepartment(TEAM, { name: 'X', parentId: 'ghost' })
		).rejects.toMatchObject({ code: 'parentNotFound' });
		expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
	});

	it('兄弟に同名 → DepartmentTreeError(nameConflict)、 Put しない', async () => {
		mockDepartments([{ id: 'p1', name: '開発本部' }, { id: 'a', name: 'バックエンド課', parentId: 'p1' }]);
		await expect(
			createDepartment(TEAM, { name: 'バックエンド課', parentId: 'p1' })
		).rejects.toBeInstanceOf(DepartmentTreeError);
		expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
	});

	it('親違いなら同名 OK (兄弟一意はスコープが親単位)', async () => {
		mockDepartments([{ id: 'p1', name: '開発本部' }, { id: 's', name: '営業本部' }]);
		// p1 配下に「営業本部」を作る (root の s と同名だが親が違うので衝突しない)
		const r = await createDepartment(TEAM, { name: '営業本部', parentId: 'p1' });
		expect(r.parentId).toBe('p1');
		expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
	});
});

describe('moveDepartment (ADR 0013 / #240)', () => {
	// r ─ a ─ a1 / r ─ b / s(別ルート)
	const tree = [
		{ id: 'r', name: '開発本部' },
		{ id: 'a', name: 'バックエンド課', parentId: 'r' },
		{ id: 'a1', name: 'API班', parentId: 'a' },
		{ id: 'b', name: 'フロント課', parentId: 'r' },
		{ id: 's', name: '営業本部' }
	];

	it('別ルートへ移動 → SET parentId + attribute_exists', async () => {
		mockDepartments(tree);
		await moveDepartment(TEAM, 'a', 's');
		const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
		expect(input.Key).toEqual({ pk: `TEAM#${TEAM}`, sk: 'DEPT#a' });
		expect(input.UpdateExpression).toBe('SET parentId = :parentId');
		expect(input.ExpressionAttributeValues).toEqual({ ':parentId': 's' });
		expect(input.ConditionExpression).toBe('attribute_exists(sk)');
	});

	it('ルート化 (newParentId=null) → REMOVE parentId', async () => {
		mockDepartments(tree);
		await moveDepartment(TEAM, 'a', null);
		const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
		expect(input.UpdateExpression).toBe('REMOVE parentId');
		expect(input.ConditionExpression).toBe('attribute_exists(sk)');
	});

	it('自分自身を親に → cycle、 書き込まない', async () => {
		mockDepartments(tree);
		await expect(moveDepartment(TEAM, 'a', 'a')).rejects.toMatchObject({ code: 'cycle' });
		expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
	});

	it('自分の子孫を親に → cycle、 書き込まない', async () => {
		mockDepartments(tree);
		await expect(moveDepartment(TEAM, 'r', 'a1')).rejects.toMatchObject({ code: 'cycle' });
		expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
	});

	it('存在しない親 → parentNotFound', async () => {
		mockDepartments(tree);
		await expect(moveDepartment(TEAM, 'a', 'ghost')).rejects.toMatchObject({
			code: 'parentNotFound'
		});
	});

	it('move 対象自体が存在しない → notFound、 書き込まない (直 POST 対策)', async () => {
		mockDepartments(tree);
		await expect(moveDepartment(TEAM, 'ghost', 'r')).rejects.toMatchObject({ code: 'notFound' });
		expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
	});

	it('移動先で兄弟名が衝突 → nameConflict', async () => {
		// s 配下に既に「バックエンド課」がある状態で a(バックエンド課) を s へ移すと衝突
		mockDepartments([...tree, { id: 'dup', name: 'バックエンド課', parentId: 's' }]);
		await expect(moveDepartment(TEAM, 'a', 's')).rejects.toMatchObject({ code: 'nameConflict' });
	});
});

describe('listDepartments', () => {
	it('returns departments with parentId normalized to null for roots', async () => {
		mockDepartments([{ id: 'r', name: '開発本部' }, { id: 'a', name: '課', parentId: 'r' }]);
		const result = await listDepartments(TEAM);
		expect(result).toEqual([
			{ id: 'r', name: '開発本部', parentId: null },
			{ id: 'a', name: '課', parentId: 'r' }
		]);
		const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
		expect(input.KeyConditionExpression).toBe('pk = :pk AND begins_with(sk, :dept)');
		expect(input.ExpressionAttributeValues).toMatchObject({ ':pk': `TEAM#${TEAM}`, ':dept': 'DEPT#' });
	});
});

describe('deleteDepartment (ADR 0013 / #241 reparent)', () => {
	/**
	 * deleteDepartment は 2 query (DEPT# / RES#) → 1 TransactWrite を出す。
	 * 部署一覧と「departmentId が一致する Resource の SK」を別々に mock する。
	 */
	function mockDeleteScene(opts: {
		departments: { id: string; name: string; parentId?: string }[];
		resourceSks: string[];
	}) {
		ddbMock
			.on(QueryCommand, { KeyConditionExpression: 'pk = :pk AND begins_with(sk, :dept)' })
			.resolves({
				Items: opts.departments.map((d) => ({
					pk: `TEAM#${TEAM}`,
					sk: `DEPT#${d.id}`,
					id: d.id,
					name: d.name,
					...(d.parentId ? { parentId: d.parentId } : {})
				}))
			});
		ddbMock
			.on(QueryCommand, { KeyConditionExpression: 'pk = :pk AND begins_with(sk, :res)' })
			.resolves({ Items: opts.resourceSks.map((sk) => ({ sk })) });
		ddbMock.on(TransactWriteCommand).resolves({});
	}

	/** 削除ツリー: r(root) > a > a1、 別ルート s。 */
	const tree = [
		{ id: 'r', name: '開発本部' },
		{ id: 'a', name: 'バックエンド課', parentId: 'r' },
		{ id: 'a1', name: 'API 班', parentId: 'a' },
		{ id: 's', name: '営業本部' }
	];

	function transactItems() {
		return ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
	}

	it('非ルート削除: 子部署と所属 Resource を親へ繰り上げ + 本体 Delete', async () => {
		// a(親 r) を削除 → 子 a1 と所属 Resource は親 r へ。
		mockDeleteScene({ departments: tree, resourceSks: [`RES#u1`, `RES#u2`] });
		await deleteDepartment(TEAM, 'a');

		const items = transactItems();
		// a1 の parentId を r に SET
		expect(items).toContainEqual({
			Update: {
				TableName: TABLE,
				Key: { pk: `TEAM#${TEAM}`, sk: `DEPT#a1` },
				UpdateExpression: 'SET parentId = :p',
				ExpressionAttributeValues: { ':p': 'r' }
			}
		});
		// Resource の departmentId を r に SET
		for (const sk of ['RES#u1', 'RES#u2']) {
			expect(items).toContainEqual({
				Update: {
					TableName: TABLE,
					Key: { pk: `TEAM#${TEAM}`, sk },
					UpdateExpression: 'SET departmentId = :p',
					ExpressionAttributeValues: { ':p': 'r' }
				}
			});
		}
		// 本体 Delete (存在確認付き)
		expect(items).toContainEqual({
			Delete: {
				TableName: TABLE,
				Key: { pk: `TEAM#${TEAM}`, sk: `DEPT#a` },
				ConditionExpression: 'attribute_exists(sk)'
			}
		});
		// Assignment (ASN#) は無傷 — 一切触れない
		expect(items.some((i) => JSON.stringify(i).includes('ASN#'))).toBe(false);
	});

	it('ルート削除: 子 → ルート (REMOVE parentId)、 Resource → 未所属 (REMOVE departmentId)', async () => {
		// r(ルート) を削除 → 子 a は parentId 削除、 所属 Resource は departmentId 削除。
		mockDeleteScene({ departments: tree, resourceSks: [`RES#u9`] });
		await deleteDepartment(TEAM, 'r');

		const items = transactItems();
		expect(items).toContainEqual({
			Update: {
				TableName: TABLE,
				Key: { pk: `TEAM#${TEAM}`, sk: `DEPT#a` },
				UpdateExpression: 'REMOVE parentId'
			}
		});
		expect(items).toContainEqual({
			Update: {
				TableName: TABLE,
				Key: { pk: `TEAM#${TEAM}`, sk: `RES#u9` },
				UpdateExpression: 'REMOVE departmentId'
			}
		});
		expect(items).toContainEqual({
			Delete: {
				TableName: TABLE,
				Key: { pk: `TEAM#${TEAM}`, sk: `DEPT#r` },
				ConditionExpression: 'attribute_exists(sk)'
			}
		});
	});

	it('子なし・所属なし → 本体 Delete のみ', async () => {
		mockDeleteScene({ departments: tree, resourceSks: [] });
		await deleteDepartment(TEAM, 's');
		const items = transactItems();
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ Delete: { Key: { sk: `DEPT#s` } } });
	});

	it('存在しないノード → no-op (TransactWrite を出さない、 idempotent)', async () => {
		mockDeleteScene({ departments: tree, resourceSks: [] });
		await deleteDepartment(TEAM, 'ghost');
		expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
	});

	it('TransactWriteItems の上限 (100) を超える → throw、 書き込まない', async () => {
		const many = Array.from({ length: 100 }, (_, i) => `RES#u${i}`);
		mockDeleteScene({ departments: tree, resourceSks: many }); // 100 + delete 1 = 101 > 100
		await expect(deleteDepartment(TEAM, 's')).rejects.toThrow(/exceeds/);
		expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
	});
});
