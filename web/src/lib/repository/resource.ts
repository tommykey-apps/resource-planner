import {
	PutCommand,
	UpdateCommand,
	QueryCommand,
	TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import { newId } from '$lib/id';
import { pk, resourceSk, SK_PREFIX } from './keys';
import { queryRelatedAssignmentSk } from './assignment';
import { deleteEach, type BulkDeleteResult } from './bulk';
import type { Resource } from '$lib/types';
import type { ResourceCreateInput, ResourceUpdateInput } from '$lib/schemas';

export const TRANSACT_MAX_ITEMS = 100;

/**
 * 一括操作の対象に存在しないメンバーが混ざっていた (他の利用者が先に削除した等)。
 * トランザクション全体が取り消されているので、 誰も変わっていない。 action 層が 409 に map する。
 */
export class BulkTargetMissingError extends Error {
	constructor() {
		super('bulk target missing');
		this.name = 'BulkTargetMissingError';
	}
}

export async function createResource(
	teamId: string,
	input: ResourceCreateInput
): Promise<Resource> {
	const id = newId();
	// #239: 未所属 (departmentId なし) は attribute を保存しない (REMOVE semantics、 Project と同規約)。
	const item: Resource = {
		id,
		name: input.name,
		...(input.departmentId ? { departmentId: input.departmentId } : {})
	};
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
	// #239: departmentId は 「指定あり → SET / 未所属 → REMOVE」 を出し分ける (updateProject と同パターン)。
	const sets = ['#name = :name'];
	const removes: string[] = [];
	const values: Record<string, unknown> = { ':name': input.name };

	if (input.departmentId) {
		sets.push('departmentId = :departmentId');
		values[':departmentId'] = input.departmentId;
	} else {
		removes.push('departmentId');
	}

	const expr =
		`SET ${sets.join(', ')}` + (removes.length > 0 ? ` REMOVE ${removes.join(', ')}` : '');

	await ddb.send(
		new UpdateCommand({
			TableName: TABLE,
			Key: { pk: pk(teamId), sk: resourceSk(input.id) },
			UpdateExpression: expr,
			ExpressionAttributeNames: { '#name': 'name' },
			ExpressionAttributeValues: values,
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
	const related = await queryRelatedAssignmentSk(teamId, 'resourceId', id);

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
 * `departmentId` が一致する Resource の SK 一覧を返す (#241 部署削除の繰り上げ対象)。
 * `pk = TEAM#X AND begins_with(sk, "RES#")` を Query して `departmentId` で post-filter。
 * pagination (`LastEvaluatedKey`) 対応。 `queryRelatedAssignmentSk` (assignment) と同パターン。
 */
export async function queryResourceSkByDepartment(
	teamId: string,
	departmentId: string
): Promise<string[]> {
	const skList: string[] = [];
	let lastKey: Record<string, unknown> | undefined;
	do {
		const out = await ddb.send(
			new QueryCommand({
				TableName: TABLE,
				KeyConditionExpression: 'pk = :pk AND begins_with(sk, :res)',
				FilterExpression: 'departmentId = :v',
				ExpressionAttributeValues: {
					':pk': pk(teamId),
					':res': SK_PREFIX.resource,
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

/** 選んだメンバーをまとめて削除する (1 人ごとに原子的な cascade、 詳細は ./bulk.ts)。 */
export async function deleteResources(teamId: string, ids: string[]): Promise<BulkDeleteResult> {
	return deleteEach(ids, (id) => deleteResource(teamId, id));
}

/**
 * 選んだメンバーの所属部署をまとめて変える。 1 回の TransactWriteItems で全員を更新し、
 * 1 人でも存在しなければ (ConditionExpression) 全体を取り消す (全員変わるか、 誰も変わらない)。
 * `departmentId` が undefined なら未所属 (attribute REMOVE、 updateResource と同規約)。
 */
export async function moveResourcesToDepartment(
	teamId: string,
	ids: string[],
	departmentId: string | undefined
): Promise<void> {
	if (ids.length > TRANSACT_MAX_ITEMS) {
		throw new Error(`bulk move exceeds ${TRANSACT_MAX_ITEMS} items (ids: ${ids.length})`);
	}
	try {
		await sendBulkMove(teamId, ids, departmentId);
	} catch (e) {
		// assignment.ts / team.ts と同じ name 判定 (instanceof は SDK の re-export で不安定)。
		// ConditionExpression の失敗は TransactionCanceledException として返る。
		if ((e as { name?: string }).name === 'TransactionCanceledException') {
			throw new BulkTargetMissingError();
		}
		throw e;
	}
}

function sendBulkMove(teamId: string, ids: string[], departmentId: string | undefined) {
	return ddb.send(
		new TransactWriteCommand({
			TransactItems: ids.map((id) => ({
				Update: {
					TableName: TABLE,
					Key: { pk: pk(teamId), sk: resourceSk(id) },
					...(departmentId
						? {
								UpdateExpression: 'SET departmentId = :departmentId',
								ExpressionAttributeValues: { ':departmentId': departmentId }
							}
						: { UpdateExpression: 'REMOVE departmentId' }),
					ConditionExpression: 'attribute_exists(sk)'
				}
			}))
		})
	);
}
