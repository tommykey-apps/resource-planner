import {
	PutCommand,
	UpdateCommand,
	QueryCommand,
	TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import { newId } from '$lib/id';
import { pk, projectSk, SK_PREFIX } from './keys';
import type { Project } from '$lib/types';
import type { ProjectCreateInput, ProjectUpdateInput } from '$lib/schemas';

const TRANSACT_MAX_ITEMS = 100;

export async function createProject(teamId: string, input: ProjectCreateInput): Promise<Project> {
	const id = newId();
	// 空 detail は item から除外して保存 (REMOVE 相当)。 後段 updateProject の
	// REMOVE 動作と整合させ、 `attribute_exists(description)` 等の Query 期待値を一貫させる。
	const item: Project = {
		id,
		name: input.name,
		color: input.color,
		...(input.description ? { description: input.description } : {}),
		...(input.tags.length > 0 ? { tags: input.tags } : {}),
		...(input.links.length > 0 ? { links: input.links } : {})
	};
	await ddb.send(
		new PutCommand({
			TableName: TABLE,
			Item: { pk: pk(teamId), sk: projectSk(id), ...item },
			ConditionExpression: 'attribute_not_exists(sk)'
		})
	);
	return item;
}

/**
 * description/tags/links は 「空 → REMOVE / 非空 → SET」 を attribute 単位で出し分ける (ADR 0010)。
 *
 * DynamoDB UpdateExpression 公式仕様:
 * - SET と REMOVE は同一 expression 内で **異なる attribute** に並べる場合のみ並走可能
 *   ([AWS docs](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.UpdateExpressions.html))
 * - 同名 attribute path が SET と REMOVE で重複すると `ValidationException: Two document paths
 *   overlap` で reject される
 * - keyword は 1 expression 内で 1 回まで、 actions は comma 区切り、 keyword 間は space 区切り
 *   (e.g. `SET a = :a, b = :b REMOVE c, d`)
 */
export async function updateProject(teamId: string, input: ProjectUpdateInput): Promise<void> {
	const sets: string[] = ['#name = :name', 'color = :color'];
	const removes: string[] = [];
	const names: Record<string, string> = { '#name': 'name' };
	const values: Record<string, unknown> = { ':name': input.name, ':color': input.color };

	if (input.description && input.description.length > 0) {
		sets.push('description = :description');
		values[':description'] = input.description;
	} else {
		removes.push('description');
	}

	if (input.tags.length > 0) {
		sets.push('tags = :tags');
		values[':tags'] = input.tags;
	} else {
		removes.push('tags');
	}

	if (input.links.length > 0) {
		sets.push('links = :links');
		values[':links'] = input.links;
	} else {
		removes.push('links');
	}

	const expr =
		`SET ${sets.join(', ')}` + (removes.length > 0 ? ` REMOVE ${removes.join(', ')}` : '');

	await ddb.send(
		new UpdateCommand({
			TableName: TABLE,
			Key: { pk: pk(teamId), sk: projectSk(input.id) },
			UpdateExpression: expr,
			ExpressionAttributeNames: names,
			ExpressionAttributeValues: values,
			ConditionExpression: 'attribute_exists(sk)'
		})
	);
}

/**
 * Project と関連 Assignment を **原子的に** cascade delete する (UC-06 / ADR 0006)。
 * 詳細は [`./resource.ts` の `deleteResource`](./resource.ts) と同じ設計。
 */
export async function deleteProject(teamId: string, id: string): Promise<void> {
	const teamPk = pk(teamId);
	const related = await queryRelatedAssignmentSkByProject(teamId, id);

	const totalItems = related.length + 1;
	if (totalItems > TRANSACT_MAX_ITEMS) {
		throw new Error(
			`cascade delete exceeds ${TRANSACT_MAX_ITEMS} items (related assignments: ${related.length})`
		);
	}

	await ddb.send(
		new TransactWriteCommand({
			TransactItems: [
				{ Delete: { TableName: TABLE, Key: { pk: teamPk, sk: projectSk(id) } } },
				...related.map((sk) => ({
					Delete: { TableName: TABLE, Key: { pk: teamPk, sk } }
				}))
			]
		})
	);
}

async function queryRelatedAssignmentSkByProject(
	teamId: string,
	projectId: string
): Promise<string[]> {
	const skList: string[] = [];
	let lastKey: Record<string, unknown> | undefined;
	do {
		const out = await ddb.send(
			new QueryCommand({
				TableName: TABLE,
				KeyConditionExpression: 'pk = :pk AND begins_with(sk, :asn)',
				FilterExpression: 'projectId = :pid',
				ExpressionAttributeValues: {
					':pk': pk(teamId),
					':asn': SK_PREFIX.assignment,
					':pid': projectId
				},
				ProjectionExpression: 'sk',
				ExclusiveStartKey: lastKey
			})
		);
		for (const item of out.Items ?? []) {
			if (typeof item.sk === 'string') skList.push(item.sk);
		}
		lastKey = out.LastEvaluatedKey;
	} while (lastKey);
	return skList;
}
