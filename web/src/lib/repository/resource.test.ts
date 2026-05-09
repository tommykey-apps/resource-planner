import {
	DeleteCommand,
	DynamoDBDocumentClient,
	PutCommand,
	QueryCommand,
	TransactWriteCommand,
	UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createResource, deleteResource, updateResource } from './resource';

const ddbMock = mockClient(DynamoDBDocumentClient);
const ORG = 'org-test';
const TABLE = 'resource-planner-test';

beforeEach(() => {
	ddbMock.reset();
});

afterEach(() => {
	ddbMock.reset();
});

describe('createResource', () => {
	it('sends PutCommand with pk/sk/id/name and attribute_not_exists guard', async () => {
		ddbMock.on(PutCommand).resolves({});

		const result = await createResource(ORG, { name: 'Alice' });

		expect(result.name).toBe('Alice');
		expect(typeof result.id).toBe('string');
		expect(result.id.length).toBeGreaterThan(0);

		const calls = ddbMock.commandCalls(PutCommand);
		expect(calls).toHaveLength(1);
		const input = calls[0].args[0].input;
		expect(input.TableName).toBe(TABLE);
		expect(input.ConditionExpression).toBe('attribute_not_exists(sk)');
		expect(input.Item).toMatchObject({
			pk: `ORG#${ORG}`,
			sk: `RES#${result.id}`,
			id: result.id,
			name: 'Alice'
		});
	});
});

describe('updateResource', () => {
	it('sends UpdateCommand with #name placeholder + attribute_exists guard', async () => {
		ddbMock.on(UpdateCommand).resolves({});

		await updateResource(ORG, { id: 'res-1', name: 'Bob' });

		const calls = ddbMock.commandCalls(UpdateCommand);
		expect(calls).toHaveLength(1);
		const input = calls[0].args[0].input;
		expect(input.TableName).toBe(TABLE);
		expect(input.Key).toEqual({ pk: `ORG#${ORG}`, sk: 'RES#res-1' });
		expect(input.UpdateExpression).toBe('SET #name = :name');
		expect(input.ExpressionAttributeNames).toEqual({ '#name': 'name' });
		expect(input.ExpressionAttributeValues).toEqual({ ':name': 'Bob' });
		expect(input.ConditionExpression).toBe('attribute_exists(sk)');
	});
});

describe('deleteResource (cascade)', () => {
	it('queries related assignments then transact-deletes resource + assignments atomically', async () => {
		ddbMock.on(QueryCommand).resolves({
			Items: [{ sk: 'ASN#2026-05-01#a1' }, { sk: 'ASN#2026-05-10#a2' }]
		});
		ddbMock.on(TransactWriteCommand).resolves({});

		await deleteResource(ORG, 'res-1');

		const queryCalls = ddbMock.commandCalls(QueryCommand);
		expect(queryCalls).toHaveLength(1);
		const qInput = queryCalls[0].args[0].input;
		expect(qInput.KeyConditionExpression).toBe('pk = :pk AND begins_with(sk, :asn)');
		expect(qInput.FilterExpression).toBe('resourceId = :rid');
		expect(qInput.ExpressionAttributeValues).toMatchObject({
			':pk': `ORG#${ORG}`,
			':asn': 'ASN#',
			':rid': 'res-1'
		});

		const txCalls = ddbMock.commandCalls(TransactWriteCommand);
		expect(txCalls).toHaveLength(1);
		const txInput = txCalls[0].args[0].input;
		expect(txInput.TransactItems).toEqual([
			{ Delete: { TableName: TABLE, Key: { pk: `ORG#${ORG}`, sk: 'RES#res-1' } } },
			{ Delete: { TableName: TABLE, Key: { pk: `ORG#${ORG}`, sk: 'ASN#2026-05-01#a1' } } },
			{ Delete: { TableName: TABLE, Key: { pk: `ORG#${ORG}`, sk: 'ASN#2026-05-10#a2' } } }
		]);
	});

	it('paginates Query when LastEvaluatedKey is returned', async () => {
		ddbMock
			.on(QueryCommand)
			.resolvesOnce({
				Items: [{ sk: 'ASN#2026-05-01#a1' }],
				LastEvaluatedKey: { pk: `ORG#${ORG}`, sk: 'ASN#2026-05-01#a1' }
			})
			.resolvesOnce({
				Items: [{ sk: 'ASN#2026-05-10#a2' }]
			});
		ddbMock.on(TransactWriteCommand).resolves({});

		await deleteResource(ORG, 'res-1');

		expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(2);
		const txInput = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
		expect(txInput.TransactItems).toHaveLength(3); // resource + 2 assignments
	});

	it('throws when cascade exceeds 100 items', async () => {
		const items = Array.from({ length: 100 }, (_, i) => ({
			sk: `ASN#2026-05-01#a${i}`
		}));
		ddbMock.on(QueryCommand).resolves({ Items: items });

		await expect(deleteResource(ORG, 'res-1')).rejects.toThrow(/exceeds 100 items/);
		expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
	});

	it('handles resource with no related assignments (transact-deletes only the resource)', async () => {
		ddbMock.on(QueryCommand).resolves({ Items: [] });
		ddbMock.on(TransactWriteCommand).resolves({});

		await deleteResource(ORG, 'res-1');

		const txInput = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
		expect(txInput.TransactItems).toEqual([
			{ Delete: { TableName: TABLE, Key: { pk: `ORG#${ORG}`, sk: 'RES#res-1' } } }
		]);
	});
});

// Sanity: unrelated DeleteCommand should never be sent by these functions
it('does not send raw DeleteCommand (delete is via TransactWrite)', async () => {
	ddbMock.on(QueryCommand).resolves({ Items: [] });
	ddbMock.on(TransactWriteCommand).resolves({});
	await deleteResource(ORG, 'res-1');
	expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(0);
});
