import {
	DeleteCommand,
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	QueryCommand
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	AssignmentVersionConflictError,
	createAssignment,
	deleteAssignment,
	getAssignment,
	queryRelatedAssignmentSk,
	updateAssignment
} from './assignment';

const ddbMock = mockClient(DynamoDBDocumentClient);
const TEAM = 'team-test';
const TABLE = process.env.DYNAMODB_TABLE ?? 'resource-planner-test';

beforeEach(() => {
	ddbMock.reset();
});

describe('createAssignment (ADR 0012)', () => {
	it('uses stable SK = ASN#{id}, version=1, half-open interval', async () => {
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
			endDateExclusive: '2026-06-01',
			version: 1
		});
		const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
		expect(input.Item).toMatchObject({
			pk: `TEAM#${TEAM}`,
			sk: `ASN#${result.id}`,
			id: result.id,
			startDate: '2026-05-01',
			endDateExclusive: '2026-06-01',
			version: 1
		});
		expect(input.ConditionExpression).toBe('attribute_not_exists(sk)');
	});
});

describe('updateAssignment (ADR 0012 optimistic lock)', () => {
	const baseInput = {
		id: 'a1',
		expectedVersion: 3,
		resourceId: 'r1',
		projectId: 'p1',
		startDate: '2026-05-01',
		endDateExclusive: '2026-06-01'
	};

	it('single PutCommand to stable SK with version condition, increments version', async () => {
		ddbMock.on(PutCommand).resolves({});

		const newVersion = await updateAssignment(TEAM, baseInput);

		const calls = ddbMock.commandCalls(PutCommand);
		expect(calls).toHaveLength(1);

		const input = calls[0].args[0].input;
		expect(input.Item).toMatchObject({
			pk: `TEAM#${TEAM}`,
			sk: 'ASN#a1',
			id: 'a1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-06-01',
			version: 4
		});
		expect(input.ConditionExpression).toBe('attribute_exists(sk) AND version = :expected');
		expect(input.ExpressionAttributeValues).toEqual({ ':expected': 3 });
		expect(newVersion).toBe(4);
	});

	it('startDate change keeps the same SK (no rename / no TransactWrite)', async () => {
		ddbMock.on(PutCommand).resolves({});

		await updateAssignment(TEAM, { ...baseInput, startDate: '2026-05-15' });

		const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
		expect(input.Item).toMatchObject({ sk: 'ASN#a1', startDate: '2026-05-15' });
	});

	it('maps ConditionalCheckFailedException to AssignmentVersionConflictError', async () => {
		ddbMock
			.on(PutCommand)
			.rejects(new ConditionalCheckFailedException({ message: 'conflict', $metadata: {} }));

		await expect(updateAssignment(TEAM, baseInput)).rejects.toBeInstanceOf(
			AssignmentVersionConflictError
		);
	});
});

describe('deleteAssignment (ADR 0012)', () => {
	it('sends DeleteCommand with stable SK = ASN#{id}', async () => {
		ddbMock.on(DeleteCommand).resolves({});

		await deleteAssignment(TEAM, 'a1');

		const input = ddbMock.commandCalls(DeleteCommand)[0].args[0].input;
		expect(input.Key).toEqual({ pk: `TEAM#${TEAM}`, sk: 'ASN#a1' });
	});
});

describe('getAssignment (ADR 0012)', () => {
	it('returns the item with version (legacy 欠落は 1 に default)', async () => {
		ddbMock.on(GetCommand).resolves({
			Item: {
				pk: `TEAM#${TEAM}`,
				sk: 'ASN#a1',
				id: 'a1',
				resourceId: 'r1',
				projectId: 'p1',
				startDate: '2026-05-01',
				endDateExclusive: '2026-06-01',
				version: 5
			}
		});

		const result = await getAssignment(TEAM, 'a1');
		expect(result).toEqual({
			id: 'a1',
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-06-01',
			version: 5
		});
	});

	it('returns null when not found', async () => {
		ddbMock.on(GetCommand).resolves({});
		expect(await getAssignment(TEAM, 'missing')).toBeNull();
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
