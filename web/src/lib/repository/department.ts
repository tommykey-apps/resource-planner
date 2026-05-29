import { PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import { newId } from '$lib/id';
import { pk, departmentSk, SK_PREFIX } from './keys';
import { wouldCreateCycle, siblingNameConflict } from './department-tree';
import type { Department } from '$lib/types';
import type { DepartmentCreateInput } from '$lib/schemas';

/**
 * ツリー整合性違反 (ADR 0013)。 form action / API が catch して 400/409 + code に map する。
 * - cycle:          自分自身 / 子孫を親に指定 (move)
 * - nameConflict:   兄弟内で名前重複 (create / move)
 * - parentNotFound: 指定した親 Department が存在しない
 */
export class DepartmentTreeError extends Error {
	constructor(public readonly code: 'cycle' | 'nameConflict' | 'parentNotFound') {
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
				parentId: (item.parentId as string | undefined) ?? null
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
	if (newParentId !== null && !existing.some((d) => d.id === newParentId)) {
		throw new DepartmentTreeError('parentNotFound');
	}
	if (wouldCreateCycle(existing, id, newParentId)) {
		throw new DepartmentTreeError('cycle');
	}
	const node = existing.find((d) => d.id === id);
	if (node && siblingNameConflict(existing, newParentId, node.name, id)) {
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
