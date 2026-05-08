import { PutCommand, DeleteCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import { newId } from '$lib/id';
import { pk, assignmentSk } from './keys';
import type { Assignment } from '$lib/types';
import type { AssignmentCreateInput, AssignmentUpdateInput } from '$lib/schemas';

export async function createAssignment(
	orgId: string,
	input: AssignmentCreateInput
): Promise<Assignment> {
	const id = newId();
	const item: Assignment = { id, ...input };
	await ddb.send(
		new PutCommand({
			TableName: TABLE,
			Item: { pk: pk(orgId), sk: assignmentSk(input.startDate, id), ...item },
			ConditionExpression: 'attribute_not_exists(sk)'
		})
	);
	return item;
}

/**
 * Assignment の更新は startDate 変更があると SK が変わる (ASN#{startDate}#{id})。
 * UpdateItem では SK を変更できないため、TransactWriteItems で旧 SK Delete + 新 SK Put を原子的に実行する。
 *
 * @param prevStartDate - 変更前の startDate (旧 SK 計算用)
 */
export async function updateAssignment(
	orgId: string,
	prevStartDate: string,
	input: AssignmentUpdateInput
): Promise<void> {
	const oldSk = assignmentSk(prevStartDate, input.id);
	const newSk = assignmentSk(input.startDate, input.id);

	if (oldSk === newSk) {
		// SK 変更なし → 通常 Put で上書き
		await ddb.send(
			new PutCommand({
				TableName: TABLE,
				Item: {
					pk: pk(orgId),
					sk: newSk,
					id: input.id,
					resourceId: input.resourceId,
					projectId: input.projectId,
					startDate: input.startDate,
					endDate: input.endDate
				},
				ConditionExpression: 'attribute_exists(sk)'
			})
		);
		return;
	}

	// SK 変更あり → 旧 Delete + 新 Put を原子的に
	await ddb.send(
		new TransactWriteCommand({
			TransactItems: [
				{
					Delete: {
						TableName: TABLE,
						Key: { pk: pk(orgId), sk: oldSk },
						ConditionExpression: 'attribute_exists(sk)'
					}
				},
				{
					Put: {
						TableName: TABLE,
						Item: {
							pk: pk(orgId),
							sk: newSk,
							id: input.id,
							resourceId: input.resourceId,
							projectId: input.projectId,
							startDate: input.startDate,
							endDate: input.endDate
						},
						ConditionExpression: 'attribute_not_exists(sk)'
					}
				}
			]
		})
	);
}

export async function deleteAssignment(
	orgId: string,
	startDate: string,
	id: string
): Promise<void> {
	await ddb.send(
		new DeleteCommand({
			TableName: TABLE,
			Key: { pk: pk(orgId), sk: assignmentSk(startDate, id) }
		})
	);
}
