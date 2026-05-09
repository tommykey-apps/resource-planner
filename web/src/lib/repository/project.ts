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
	const item: Project = { id, name: input.name, color: input.color };
	await ddb.send(
		new PutCommand({
			TableName: TABLE,
			Item: { pk: pk(teamId), sk: projectSk(id), ...item },
			ConditionExpression: 'attribute_not_exists(sk)'
		})
	);
	return item;
}

export async function updateProject(teamId: string, input: ProjectUpdateInput): Promise<void> {
	await ddb.send(
		new UpdateCommand({
			TableName: TABLE,
			Key: { pk: pk(teamId), sk: projectSk(input.id) },
			UpdateExpression: 'SET #name = :name, color = :color',
			ExpressionAttributeNames: { '#name': 'name' },
			ExpressionAttributeValues: { ':name': input.name, ':color': input.color },
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
