import {
	PutCommand,
	UpdateCommand,
	QueryCommand,
	TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import { newId } from '$lib/id';
import { pk, resourceSk, SK_PREFIX } from './keys';
import type { Resource } from '$lib/types';
import type { ResourceCreateInput, ResourceUpdateInput } from '$lib/schemas';

const TRANSACT_MAX_ITEMS = 100;

export async function createResource(teamId: string, input: ResourceCreateInput): Promise<Resource> {
	const id = newId();
	const item: Resource = { id, name: input.name };
	await ddb.send(
		new PutCommand({
			TableName: TABLE,
			Item: { pk: pk(teamId), sk: resourceSk(id), ...item },
			ConditionExpression: 'attribute_not_exists(sk)'
		})
	);
	return item;
}

export async function updateResource(teamId: string, input: ResourceUpdateInput): Promise<void> {
	await ddb.send(
		new UpdateCommand({
			TableName: TABLE,
			Key: { pk: pk(teamId), sk: resourceSk(input.id) },
			UpdateExpression: 'SET #name = :name',
			ExpressionAttributeNames: { '#name': 'name' },
			ExpressionAttributeValues: { ':name': input.name },
			ConditionExpression: 'attribute_exists(sk)'
		})
	);
}

/**
 * Resource と関連 Assignment を **原子的に** cascade delete する (UC-06 / ADR 0006)。
 *
 * 関連 Assignment の検索: `pk = TEAM#X AND begins_with(sk, "ASN#")` を Query して、
 * `resourceId == id` で post-filter (FilterExpression)。
 * Resource 自身 + 関連 Assignment を 1 つの `TransactWriteItems` で削除。
 *
 * **TransactWriteItems の上限 100 items**。これを超える Assignment が紐づいていた場合は
 * `Error('cascade delete exceeds 100 items')` を throw。100 件超のフォールバック
 * (BatchWriteItem) は YAGNI として未実装 (1 リソースが 100 件以上アサインされる運用は
 * 想定外、社内 100 ユーザー / 月単位アサイン)。
 */
export async function deleteResource(teamId: string, id: string): Promise<void> {
	const teamPk = pk(teamId);
	const related = await queryRelatedAssignmentSkByResource(teamId, id);

	const totalItems = related.length + 1;
	if (totalItems > TRANSACT_MAX_ITEMS) {
		throw new Error(
			`cascade delete exceeds ${TRANSACT_MAX_ITEMS} items (related assignments: ${related.length})`
		);
	}

	await ddb.send(
		new TransactWriteCommand({
			TransactItems: [
				{ Delete: { TableName: TABLE, Key: { pk: teamPk, sk: resourceSk(id) } } },
				...related.map((sk) => ({
					Delete: { TableName: TABLE, Key: { pk: teamPk, sk } }
				}))
			]
		})
	);
}

/**
 * `pk = TEAM#X AND begins_with(sk, "ASN#")` を Query して、`resourceId === id` の SK 一覧を返す。
 * pagination (`LastEvaluatedKey`) 対応。
 */
async function queryRelatedAssignmentSkByResource(
	teamId: string,
	resourceId: string
): Promise<string[]> {
	const skList: string[] = [];
	let lastKey: Record<string, unknown> | undefined;
	do {
		const out = await ddb.send(
			new QueryCommand({
				TableName: TABLE,
				KeyConditionExpression: 'pk = :pk AND begins_with(sk, :asn)',
				FilterExpression: 'resourceId = :rid',
				ExpressionAttributeValues: {
					':pk': pk(teamId),
					':asn': SK_PREFIX.assignment,
					':rid': resourceId
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
