import { PutCommand, DeleteCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import { newId } from '$lib/id';
import { pk, assignmentSk, SK_PREFIX } from './keys';
import type { Assignment } from '$lib/types';
import type { AssignmentCreatePayload, AssignmentUpdatePayload } from '$lib/schemas';

/**
 * 楽観ロック競合 (ADR 0012): `version` 不一致 = 他プロセスが先に更新、 または対象が消えた。
 * API 層 (`+server.ts`) が catch して 409 + 最新 item に map する。
 */
export class AssignmentVersionConflictError extends Error {
	constructor(public readonly assignmentId: string) {
		super(`assignment ${assignmentId} version conflict`);
		this.name = 'AssignmentVersionConflictError';
	}
}

export async function createAssignment(
	teamId: string,
	input: AssignmentCreatePayload
): Promise<Assignment> {
	const id = newId();
	// version は create 時 1 始まり (ADR 0012)。
	const item: Assignment = { id, ...input, version: 1 };
	await ddb.send(
		new PutCommand({
			TableName: TABLE,
			Item: { pk: pk(teamId), sk: assignmentSk(id), ...item },
			ConditionExpression: 'attribute_not_exists(sk)'
		})
	);
	return item;
}

/**
 * Assignment 更新 (ADR 0012)。 SK = `ASN#{id}` 安定キーになったため、 startDate を変えても
 * SK は不変 = 単一 `PutCommand` で atomic に上書きできる (旧: TransactWrite で delete+put)。
 *
 * 楽観ロック: `version = :expected` を条件に書き込み、 成功時は version を +1 する。
 * 不一致 (= 他ユーザが先に更新) なら `ConditionalCheckFailedException` →
 * `AssignmentVersionConflictError` に変換して throw。
 *
 * @returns 書き込み後の新しい version
 */
export async function updateAssignment(
	teamId: string,
	input: AssignmentUpdatePayload
): Promise<number> {
	const nextVersion = input.expectedVersion + 1;
	const item = {
		id: input.id,
		resourceId: input.resourceId,
		projectId: input.projectId,
		startDate: input.startDate,
		endDateExclusive: input.endDateExclusive,
		version: nextVersion
	};
	try {
		await ddb.send(
			new PutCommand({
				TableName: TABLE,
				Item: { pk: pk(teamId), sk: assignmentSk(input.id), ...item },
				ConditionExpression: 'attribute_exists(sk) AND version = :expected',
				ExpressionAttributeValues: { ':expected': input.expectedVersion }
			})
		);
	} catch (e) {
		// team.ts と同じ name 判定パターン (instanceof は SDK の re-export で不安定)。
		const c = e as { name?: string };
		if (c.name === 'ConditionalCheckFailedException') {
			throw new AssignmentVersionConflictError(input.id);
		}
		throw e;
	}
	return nextVersion;
}

export async function deleteAssignment(teamId: string, id: string): Promise<void> {
	await ddb.send(
		new DeleteCommand({
			TableName: TABLE,
			Key: { pk: pk(teamId), sk: assignmentSk(id) }
		})
	);
}

/**
 * 単一 Assignment を取得 (主に競合 409 で「最新」を client へ返すため)。
 * 見つからなければ null。
 */
export async function getAssignment(teamId: string, id: string): Promise<Assignment | null> {
	const out = await ddb.send(
		new GetCommand({ TableName: TABLE, Key: { pk: pk(teamId), sk: assignmentSk(id) } })
	);
	const item = out.Item;
	if (!item) return null;
	// ADR 0010 「DDB read path 規約」: 全体キャストせず個別 cast に localize。
	return {
		id: item.id as string,
		resourceId: item.resourceId as string,
		projectId: item.projectId as string,
		startDate: item.startDate as string,
		endDateExclusive: item.endDateExclusive as string,
		version: (item.version as number | undefined) ?? 1
	};
}

/**
 * #172: `pk = TEAM#X AND begins_with(sk, "ASN#")` を Query して、 指定 attr (`resourceId`
 * or `projectId`) が一致する Assignment の SK 一覧を返す。 pagination (`LastEvaluatedKey`)
 * 対応。 cascade delete (`resource.ts.deleteResource` / `project.ts.deleteProject`) で
 * 関連 assignment の SK を取り出すのに使う。
 *
 * 旧実装は `queryRelatedAssignmentSkBy{Resource,Project}` で 2 関数完全コピペだったので
 * `attrName` 引数で 1 つに集約 (literal union で誤用防止)。
 */
export async function queryRelatedAssignmentSk(
	teamId: string,
	attrName: 'resourceId' | 'projectId',
	attrValue: string
): Promise<string[]> {
	const skList: string[] = [];
	let lastKey: Record<string, unknown> | undefined;
	do {
		const out = await ddb.send(
			new QueryCommand({
				TableName: TABLE,
				KeyConditionExpression: 'pk = :pk AND begins_with(sk, :asn)',
				FilterExpression: `${attrName} = :v`,
				ExpressionAttributeValues: {
					':pk': pk(teamId),
					':asn': SK_PREFIX.assignment,
					':v': attrValue
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
