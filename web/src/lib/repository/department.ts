import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import { newId } from '$lib/id';
import { pk, departmentSk } from './keys';
import type { Department } from '$lib/types';
import type { DepartmentCreateInput } from '$lib/schemas';

/**
 * Department を作成する (ADR 0013、 adjacency-list ツリーのノード)。
 *
 * `parentId = null` (ルート) は **attribute を保存しない** (REMOVE semantics、 read 側で null に
 * 正規化)。 子部署は `parentId` を属性として持つ。 一覧は `queryAllByTeam` 経由 (1 query)。
 */
export async function createDepartment(
	teamId: string,
	input: DepartmentCreateInput
): Promise<Department> {
	const id = newId();
	const parentId = input.parentId ?? null;
	const item: Department = { id, name: input.name, parentId };
	await ddb.send(
		new PutCommand({
			TableName: TABLE,
			Item: {
				pk: pk(teamId),
				sk: departmentSk(id),
				id,
				name: input.name,
				// ルートは parentId 属性を持たない (read で null 正規化)。
				...(parentId ? { parentId } : {})
			},
			ConditionExpression: 'attribute_not_exists(sk)'
		})
	);
	return item;
}
