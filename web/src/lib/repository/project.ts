import { PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import { newId } from '$lib/id';
import { pk, projectSk } from './keys';
import type { Project } from '$lib/types';
import type { ProjectCreateInput, ProjectUpdateInput } from '$lib/schemas';

export async function createProject(orgId: string, input: ProjectCreateInput): Promise<Project> {
	const id = newId();
	const item: Project = { id, name: input.name, color: input.color };
	await ddb.send(
		new PutCommand({
			TableName: TABLE,
			Item: { pk: pk(orgId), sk: projectSk(id), ...item },
			ConditionExpression: 'attribute_not_exists(sk)'
		})
	);
	return item;
}

export async function updateProject(orgId: string, input: ProjectUpdateInput): Promise<void> {
	await ddb.send(
		new UpdateCommand({
			TableName: TABLE,
			Key: { pk: pk(orgId), sk: projectSk(input.id) },
			UpdateExpression: 'SET #name = :name, color = :color',
			ExpressionAttributeNames: { '#name': 'name' },
			ExpressionAttributeValues: { ':name': input.name, ':color': input.color },
			ConditionExpression: 'attribute_exists(sk)'
		})
	);
}

export async function deleteProject(orgId: string, id: string): Promise<void> {
	// 関連 Assignment の cascade は PR-H で実装。
	await ddb.send(
		new DeleteCommand({
			TableName: TABLE,
			Key: { pk: pk(orgId), sk: projectSk(id) }
		})
	);
}
