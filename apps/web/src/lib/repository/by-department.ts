import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import { pk, SK_PREFIX } from './keys';

/**
 * `departmentId` が一致する item の SK 一覧を返す (#241 / ADR 0016 部署削除の付け替え対象)。
 * `pk = TEAM#X AND begins_with(sk, prefix)` を Query して `departmentId` で post-filter。
 * pagination (`LastEvaluatedKey`) 対応。 `queryRelatedAssignmentSk` (assignment) と同パターン。
 */
export async function querySkByDepartment(
	teamId: string,
	prefix: typeof SK_PREFIX.resource | typeof SK_PREFIX.project,
	departmentId: string
): Promise<string[]> {
	const skList: string[] = [];
	let lastKey: Record<string, unknown> | undefined;
	do {
		const out = await ddb.send(
			new QueryCommand({
				TableName: TABLE,
				KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
				FilterExpression: 'departmentId = :v',
				ExpressionAttributeValues: {
					':pk': pk(teamId),
					':prefix': prefix,
					':v': departmentId
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
