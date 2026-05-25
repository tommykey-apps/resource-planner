import {
	DeleteCommand,
	DynamoDBDocumentClient,
	PutCommand,
	QueryCommand,
	TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	createAssignment,
	deleteAssignment,
	queryRelatedAssignmentSk,
	updateAssignment
} from './assignment';

const ddbMock = mockClient(DynamoDBDocumentClient);
const TEAM = 'team-test';
const TABLE = process.env.DYNAMODB_TABLE ?? 'resource-planner-test';

beforeEach(() => {
	ddbMock.reset();
});

describe('createAssignment', () => {
	it('uses SK = ASN#{startDate}#{id} and stores half-open interval', async () => {
		ddbMock.on(PutCommand).resolves({});

		const result = await createAssignment(TEAM, {
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-06-01'
		});

		expect(result).toMatchObject({
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-06-01'
		});
		const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
		expect(input.Item).toMatchObject({
			pk: `TEAM#${TEAM}`,
			sk: `ASN#2026-05-01#${result.id}`,
			id: result.id,
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-06-01'
		});
		expect(input.ConditionExpression).toBe('attribute_not_exists(sk)');
	});
});

describe('updateAssignment (SK aware)', () => {
	const baseInput = {
		id: 'a1',
		resourceId: 'r1',
		projectId: 'p1',
		startDate: '2026-05-01',
		endDateExclusive: '2026-06-01'
	};

	it('SK unchanged → uses PutCommand with attribute_exists guard', async () => {
		ddbMock.on(PutCommand).resolves({});

		await updateAssignment(TEAM, '2026-05-01', baseInput);

		const calls = ddbMock.commandCalls(PutCommand);
		expect(calls).toHaveLength(1);
		expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);

		const input = calls[0].args[0].input;
		expect(input.Item).toMatchObject({
			pk: `TEAM#${TEAM}`,
			sk: 'ASN#2026-05-01#a1',
			id: 'a1',
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-06-01'
		});
		expect(input.ConditionExpression).toBe('attribute_exists(sk)');
	});

	it('SK changed (startDate moved) → TransactWriteCommand: old Delete + new Put atomic', async () => {
		ddbMock.on(TransactWriteCommand).resolves({});

		const moved = { ...baseInput, startDate: '2026-05-15' };
		await updateAssignment(TEAM, '2026-05-01', moved);

		expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
		const txCalls = ddbMock.commandCalls(TransactWriteCommand);
		expect(txCalls).toHaveLength(1);

		const items = txCalls[0].args[0].input.TransactItems;
		expect(items).toHaveLength(2);

		// Old SK delete (with attribute_exists guard)
		expect(items?.[0].Delete).toMatchObject({
			TableName: TABLE,
			Key: { pk: `TEAM#${TEAM}`, sk: 'ASN#2026-05-01#a1' },
			ConditionExpression: 'attribute_exists(sk)'
		});

		// New SK put (with attribute_not_exists guard)
		expect(items?.[1].Put).toMatchObject({
			TableName: TABLE,
			ConditionExpression: 'attribute_not_exists(sk)'
		});
		expect(items?.[1].Put?.Item).toMatchObject({
			pk: `TEAM#${TEAM}`,
			sk: 'ASN#2026-05-15#a1',
			startDate: '2026-05-15',
			endDateExclusive: '2026-06-01'
		});
	});
});

describe('deleteAssignment', () => {
	it('sends DeleteCommand with composite SK', async () => {
		ddbMock.on(DeleteCommand).resolves({});

		await deleteAssignment(TEAM, '2026-05-01', 'a1');

		const input = ddbMock.commandCalls(DeleteCommand)[0].args[0].input;
		expect(input.Key).toEqual({ pk: `TEAM#${TEAM}`, sk: 'ASN#2026-05-01#a1' });
	});
});

/**
 * #172: resource.ts / project.ts で重複していた `queryRelatedAssignmentSkBy{Resource,Project}` を
 * 統合した generic helper。 attrName を 'resourceId' | 'projectId' で受け取り、
 * filter expression を組み立てる。
 */
describe('queryRelatedAssignmentSk (#172)', () => {
	it('resourceId filter: FilterExpression + ExpressionAttributeValues を組む', async () => {
		ddbMock.on(QueryCommand).resolves({
			Items: [{ sk: 'ASN#2026-05-01#a1' }, { sk: 'ASN#2026-05-15#a2' }]
		});

		const result = await queryRelatedAssignmentSk(TEAM, 'resourceId', 'r1');
		expect(result).toEqual(['ASN#2026-05-01#a1', 'ASN#2026-05-15#a2']);

		const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
		expect(input.KeyConditionExpression).toBe('pk = :pk AND begins_with(sk, :asn)');
		expect(input.FilterExpression).toBe('resourceId = :v');
		expect(input.ExpressionAttributeValues).toEqual({
			':pk': `TEAM#${TEAM}`,
			':asn': 'ASN#',
			':v': 'r1'
		});
		expect(input.ProjectionExpression).toBe('sk');
	});

	it('projectId filter: FilterExpression が projectId に切り替わる', async () => {
		ddbMock.on(QueryCommand).resolves({ Items: [{ sk: 'ASN#2026-05-01#a1' }] });

		const result = await queryRelatedAssignmentSk(TEAM, 'projectId', 'p1');
		expect(result).toEqual(['ASN#2026-05-01#a1']);

		const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
		expect(input.FilterExpression).toBe('projectId = :v');
		expect(input.ExpressionAttributeValues?.[':v']).toBe('p1');
	});

	it('pagination: LastEvaluatedKey で複数 page を辿る', async () => {
		ddbMock
			.on(QueryCommand)
			.resolvesOnce({
				Items: [{ sk: 'ASN#2026-05-01#a1' }],
				LastEvaluatedKey: { pk: 'x', sk: 'ASN#2026-05-01#a1' }
			})
			.resolvesOnce({
				Items: [{ sk: 'ASN#2026-05-15#a2' }]
			});

		const result = await queryRelatedAssignmentSk(TEAM, 'resourceId', 'r1');
		expect(result).toEqual(['ASN#2026-05-01#a1', 'ASN#2026-05-15#a2']);
		expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(2);
	});

	it('結果が空ならば [] を返す', async () => {
		ddbMock.on(QueryCommand).resolves({ Items: [] });
		const result = await queryRelatedAssignmentSk(TEAM, 'resourceId', 'r1');
		expect(result).toEqual([]);
	});
});
