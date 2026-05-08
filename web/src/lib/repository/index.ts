import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import { pk, SK_PREFIX } from './keys';
import type { OrgData, Resource, Project, Assignment } from '$lib/types';

export * from './resource';
export * from './project';
export * from './assignment';

/**
 * 組織内の全データ (Resource / Project / Assignment) を 1 query で取得する。
 *
 * Single Table Design のため `Query(pk = ORG#X)` だけで 3 entity が混在で返る。
 * SK プレフィックスで振り分けて返す (access-patterns.md UC #1)。
 */
export async function queryAllByOrg(orgId: string): Promise<OrgData> {
	const data: OrgData = { resources: [], projects: [], assignments: [] };
	let lastKey: Record<string, unknown> | undefined;

	do {
		const out = await ddb.send(
			new QueryCommand({
				TableName: TABLE,
				KeyConditionExpression: 'pk = :pk',
				ExpressionAttributeValues: { ':pk': pk(orgId) },
				ExclusiveStartKey: lastKey
			})
		);

		for (const item of out.Items ?? []) {
			const sk = item.sk as string;
			if (sk.startsWith(SK_PREFIX.resource)) {
				data.resources.push({ id: item.id, name: item.name } as Resource);
			} else if (sk.startsWith(SK_PREFIX.project)) {
				data.projects.push({
					id: item.id,
					name: item.name,
					color: item.color
				} as Project);
			} else if (sk.startsWith(SK_PREFIX.assignment)) {
				data.assignments.push({
					id: item.id,
					resourceId: item.resourceId,
					projectId: item.projectId,
					startDate: item.startDate,
					endDate: item.endDate
				} as Assignment);
			}
		}

		lastKey = out.LastEvaluatedKey;
	} while (lastKey);

	return data;
}
