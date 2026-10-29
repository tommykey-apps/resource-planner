import {
	PutCommand,
	UpdateCommand,
	QueryCommand,
	TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import { newId } from '$lib/id';
import { pk, departmentSk, SK_PREFIX } from './keys';
import { wouldCreateCycle, siblingNameConflict } from './department-tree';
import { queryResourceSkByDepartment, TRANSACT_MAX_ITEMS } from './resource';
import type { Department } from '$lib/types';
import type { DepartmentCreateInput } from '$lib/schemas';

/**
 * ツリー整合性違反 (ADR 0013)。 form action / API が catch して 400/409 + code に map する。
 * - cycle:          自分自身 / 子孫を親に指定 (move)
 * - nameConflict:   兄弟内で名前重複 (create / move / rename)
 * - parentNotFound: 指定した親 Department が存在しない
 * - notFound:       move / rename 対象の Department 自体が存在しない (UI 経由では起きないが直 POST 対策)
 */
export class DepartmentTreeError extends Error {
	constructor(public readonly code: 'cycle' | 'nameConflict' | 'parentNotFound' | 'notFound') {
		super(`department tree violation: ${code}`);
		this.name = 'DepartmentTreeError';
	}
}

/** Team の全 Department を取得 (Query begins_with DEPT#)。 ツリー検証の読込元 (組織ツリーは小さい)。 */
export async function listDepartments(teamId: string): Promise<Department[]> {
	const departments: Department[] = [];
	let lastKey: Record<string, unknown> | undefined;
	do {
		const out = await ddb.send(
			new QueryCommand({
				TableName: TABLE,
				KeyConditionExpression: 'pk = :pk AND begins_with(sk, :dept)',
				ExpressionAttributeValues: { ':pk': pk(teamId), ':dept': SK_PREFIX.department },
				ExclusiveStartKey: lastKey
			})
		);
		for (const item of out.Items ?? []) {
			departments.push({
				id: item.id as string,
				name: item.name as string,
				// ルートは parentId 属性なし。 型安全のため typeof で取り出す (ADR 0010 read-path 規約)。
				parentId: typeof item.parentId === 'string' ? item.parentId : null
			});
		}
		lastKey = out.LastEvaluatedKey;
	} while (lastKey);
	return departments;
}

/**
 * Department を作成 (ADR 0013)。 親存在 + 兄弟名一意を検証してから Put。
 * ルート (parentId なし) は attribute を保存しない (REMOVE semantics、 read で null 正規化)。
 */
export async function createDepartment(
	teamId: string,
	input: DepartmentCreateInput
): Promise<Department> {
	const parentId = input.parentId ?? null;
	// 検証のため毎回 listDepartments する read コストは ADR 0013 の「組織は小さい」前提で許容。
	const existing = await listDepartments(teamId);
	if (parentId !== null && !existing.some((d) => d.id === parentId)) {
		throw new DepartmentTreeError('parentNotFound');
	}
	if (siblingNameConflict(existing, parentId, input.name)) {
		throw new DepartmentTreeError('nameConflict');
	}

	const id = newId();
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

/**
 * Department の親を付け替える (ADR 0013、 #240)。 循環 (自分/子孫を親に) と兄弟名衝突を拒否。
 * `newParentId = null` でルート化 (parentId 属性を REMOVE)。 検証は in-memory。
 */
export async function moveDepartment(
	teamId: string,
	id: string,
	newParentId: string | null
): Promise<void> {
	const existing = await listDepartments(teamId);
	// move 対象が無いと条件付き Update が ConditionalCheckFailed → 500 に化けるので先に弾く (直 POST 対策)。
	const node = existing.find((d) => d.id === id);
	if (!node) {
		throw new DepartmentTreeError('notFound');
	}
	if (newParentId !== null && !existing.some((d) => d.id === newParentId)) {
		throw new DepartmentTreeError('parentNotFound');
	}
	if (wouldCreateCycle(existing, id, newParentId)) {
		throw new DepartmentTreeError('cycle');
	}
	if (siblingNameConflict(existing, newParentId, node.name, id)) {
		throw new DepartmentTreeError('nameConflict');
	}

	const key = { pk: pk(teamId), sk: departmentSk(id) };
	await ddb.send(
		newParentId !== null
			? new UpdateCommand({
					TableName: TABLE,
					Key: key,
					UpdateExpression: 'SET parentId = :parentId',
					ExpressionAttributeValues: { ':parentId': newParentId },
					ConditionExpression: 'attribute_exists(sk)'
				})
			: new UpdateCommand({
					TableName: TABLE,
					Key: key,
					UpdateExpression: 'REMOVE parentId',
					ConditionExpression: 'attribute_exists(sk)'
				})
	);
}

/**
 * Department の名前を変える (#250)。 兄弟名一意だけ検証する (自分自身は除外)。
 * Resource は departmentId で参照するので他の item は書き換えない。
 */
export async function renameDepartment(teamId: string, id: string, name: string): Promise<void> {
	const existing = await listDepartments(teamId);
	// 対象が無いと条件付き Update が ConditionalCheckFailed → 500 に化けるので先に弾く (move と同じ)。
	const node = existing.find((d) => d.id === id);
	if (!node) {
		throw new DepartmentTreeError('notFound');
	}
	if (siblingNameConflict(existing, node.parentId, name, id)) {
		throw new DepartmentTreeError('nameConflict');
	}

	await ddb.send(
		new UpdateCommand({
			TableName: TABLE,
			Key: { pk: pk(teamId), sk: departmentSk(id) },
			UpdateExpression: 'SET #name = :name',
			ExpressionAttributeNames: { '#name': 'name' },
			ExpressionAttributeValues: { ':name': name },
			ConditionExpression: 'attribute_exists(sk)'
		})
	);
}

/**
 * Department を削除し、 配下を **親へ繰り上げる** (ADR 0013、 #241)。 ADR 0006 のカスケードとは逆方針:
 * 部署はグルーピングにすぎず、 配下の人・下位部署は独立実体なので消さない。
 *
 * - 子 Department の parentId を削除ノードの親へ (ルート削除なら REMOVE = ルート化)
 * - 所属 Resource の departmentId を削除ノードの親へ (ルート削除なら REMOVE = 未所属)
 * - これらと本体 Delete を **1 つの TransactWriteItems で原子的に** 実行
 * - Assignment は department を参照しないので無関係 (一切触れない)
 *
 * 対象が既に無ければ no-op (idempotent)。 繰り上げ + 本体で上限 100 items を超えたら throw
 * (組織は小さい前提、 BatchWrite フォールバックは YAGNI)。
 */
export async function deleteDepartment(teamId: string, id: string): Promise<void> {
	const teamPk = pk(teamId);
	const existing = await listDepartments(teamId);
	const node = existing.find((d) => d.id === id);
	if (!node) return; // 既に無ければ何もしない (idempotent)

	// 繰り上げ先 = 削除ノードの親。 親が dangling (存在しない id) ならルート扱い (null) に正規化する
	// (flattenDepartmentTree が dangling をルートとして描画するのと整合。 壊れた id を子へ伝播させない)。
	const newParentId =
		node.parentId !== null && existing.some((d) => d.id === node.parentId) ? node.parentId : null;
	const childSks = existing.filter((d) => d.parentId === id).map((d) => departmentSk(d.id));
	const resourceSks = await queryResourceSkByDepartment(teamId, id);

	const total = childSks.length + resourceSks.length + 1; // 繰り上げ + 本体 Delete
	if (total > TRANSACT_MAX_ITEMS) {
		throw new Error(
			`department delete exceeds ${TRANSACT_MAX_ITEMS} items (children: ${childSks.length}, resources: ${resourceSks.length})`
		);
	}

	// 親があれば SET、 ルート削除 (newParentId=null) なら属性を REMOVE する。
	const reparent = (sk: string, attr: 'parentId' | 'departmentId') =>
		newParentId !== null
			? {
					Update: {
						TableName: TABLE,
						Key: { pk: teamPk, sk },
						UpdateExpression: `SET ${attr} = :p`,
						ExpressionAttributeValues: { ':p': newParentId }
					}
				}
			: {
					Update: {
						TableName: TABLE,
						Key: { pk: teamPk, sk },
						UpdateExpression: `REMOVE ${attr}`
					}
				};

	await ddb.send(
		new TransactWriteCommand({
			TransactItems: [
				...childSks.map((sk) => reparent(sk, 'parentId')),
				...resourceSks.map((sk) => reparent(sk, 'departmentId')),
				{
					Delete: {
						TableName: TABLE,
						Key: { pk: teamPk, sk: departmentSk(id) },
						ConditionExpression: 'attribute_exists(sk)'
					}
				}
			]
		})
	);
}
