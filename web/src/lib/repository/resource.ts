import { PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import { newId } from '$lib/id';
import { pk, resourceSk } from './keys';
import type { Resource } from '$lib/types';
import type { ResourceCreateInput, ResourceUpdateInput } from '$lib/schemas';

export async function createResource(orgId: string, input: ResourceCreateInput): Promise<Resource> {
	const id = newId();
	const item: Resource = { id, name: input.name };
	await ddb.send(
		new PutCommand({
			TableName: TABLE,
			Item: { pk: pk(orgId), sk: resourceSk(id), ...item },
			ConditionExpression: 'attribute_not_exists(sk)'
		})
	);
	return item;
}

export async function updateResource(orgId: string, input: ResourceUpdateInput): Promise<void> {
	await ddb.send(
		new UpdateCommand({
			TableName: TABLE,
			Key: { pk: pk(orgId), sk: resourceSk(input.id) },
			UpdateExpression: 'SET #name = :name',
			ExpressionAttributeNames: { '#name': 'name' },
			ExpressionAttributeValues: { ':name': input.name },
			ConditionExpression: 'attribute_exists(sk)'
		})
	);
}

export async function deleteResource(orgId: string, id: string): Promise<void> {
	// 関連 Assignment の cascade は PR-H で実装。ここでは Resource 単体だけ削除。
	await ddb.send(
		new DeleteCommand({
			TableName: TABLE,
			Key: { pk: pk(orgId), sk: resourceSk(id) }
		})
	);
}
