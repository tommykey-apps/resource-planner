import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDepartment, moveDepartment, listDepartments, DepartmentTreeError } from './department';

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
