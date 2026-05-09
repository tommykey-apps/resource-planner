import {
	DeleteCommand,
	DynamoDBDocumentClient,
	PutCommand,
	TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAssignment, deleteAssignment, updateAssignment } from './assignment';

const ddbMock = mockClient(DynamoDBDocumentClient);
const ORG = 'org-test';
const TABLE = process.env.DYNAMODB_TABLE ?? 'resource-planner-test';

beforeEach(() => {
	ddbMock.reset();
});

describe('createAssignment', () => {
	it('uses SK = ASN#{startDate}#{id} and stores half-open interval', async () => {
		ddbMock.on(PutCommand).resolves({});

		const result = await createAssignment(ORG, {
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
			pk: `ORG#${ORG}`,
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

		await updateAssignment(ORG, '2026-05-01', baseInput);

		const calls = ddbMock.commandCalls(PutCommand);
		expect(calls).toHaveLength(1);
		expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);

		const input = calls[0].args[0].input;
		expect(input.Item).toMatchObject({
			pk: `ORG#${ORG}`,
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
		await updateAssignment(ORG, '2026-05-01', moved);

		expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
		const txCalls = ddbMock.commandCalls(TransactWriteCommand);
		expect(txCalls).toHaveLength(1);

		const items = txCalls[0].args[0].input.TransactItems;
		expect(items).toHaveLength(2);

		// Old SK delete (with attribute_exists guard)
		expect(items?.[0].Delete).toMatchObject({
			TableName: TABLE,
			Key: { pk: `ORG#${ORG}`, sk: 'ASN#2026-05-01#a1' },
			ConditionExpression: 'attribute_exists(sk)'
		});

		// New SK put (with attribute_not_exists guard)
		expect(items?.[1].Put).toMatchObject({
			TableName: TABLE,
			ConditionExpression: 'attribute_not_exists(sk)'
		});
		expect(items?.[1].Put?.Item).toMatchObject({
			pk: `ORG#${ORG}`,
			sk: 'ASN#2026-05-15#a1',
			startDate: '2026-05-15',
			endDateExclusive: '2026-06-01'
		});
	});
});

describe('deleteAssignment', () => {
	it('sends DeleteCommand with composite SK', async () => {
		ddbMock.on(DeleteCommand).resolves({});

		await deleteAssignment(ORG, '2026-05-01', 'a1');

		const input = ddbMock.commandCalls(DeleteCommand)[0].args[0].input;
		expect(input.Key).toEqual({ pk: `ORG#${ORG}`, sk: 'ASN#2026-05-01#a1' });
	});
});
