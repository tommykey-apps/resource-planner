import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDepartment } from './department';

const ddbMock = mockClient(DynamoDBDocumentClient);
const TEAM = 'team-test';
const TABLE = process.env.DYNAMODB_TABLE ?? 'resource-planner-test';

beforeEach(() => {
	ddbMock.reset();
});

/**
 * ADR 0013: Department は `pk=TEAM#{teamId}`, `sk=DEPT#{id}` の adjacency-list ノード。
 * #238 はフラット (parentId=null=ルート) の作成のみ。 ツリー/move は #240。
 */
describe('createDepartment (ADR 0013)', () => {
	it('uses SK = DEPT#{id}, stores name, attribute_not_exists guard; root は parentId 属性を持たない', async () => {
		ddbMock.on(PutCommand).resolves({});

		// root = parentId 省略 (form は parentId を送らない)
		const result = await createDepartment(TEAM, { name: '開発本部' });

		expect(result).toMatchObject({ name: '開発本部', parentId: null });
		const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
		expect(input.Item).toMatchObject({
			pk: `TEAM#${TEAM}`,
			sk: `DEPT#${result.id}`,
			id: result.id,
			name: '開発本部'
		});
		// ルート (parentId=null) は attribute を持たない (REMOVE semantics、 read で null に正規化)
		expect(input.Item).not.toHaveProperty('parentId');
		expect(input.ConditionExpression).toBe('attribute_not_exists(sk)');
	});

	it('parentId 指定時は属性として保存する (子部署、 #240 で利用)', async () => {
		ddbMock.on(PutCommand).resolves({});

		const result = await createDepartment(TEAM, { name: 'バックエンド課', parentId: 'parent-1' });

		expect(result.parentId).toBe('parent-1');
		const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
		expect(input.Item).toMatchObject({ parentId: 'parent-1' });
	});

	it('parentId 省略時は null に正規化', async () => {
		ddbMock.on(PutCommand).resolves({});
		const result = await createDepartment(TEAM, { name: '営業本部' });
		expect(result.parentId).toBeNull();
	});
});
