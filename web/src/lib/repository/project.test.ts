import {
	DynamoDBDocumentClient,
	PutCommand,
	QueryCommand,
	TransactWriteCommand,
	UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject, deleteProject, updateProject } from './project';

const ddbMock = mockClient(DynamoDBDocumentClient);
const ORG = 'org-test';
const TABLE = process.env.DYNAMODB_TABLE ?? 'resource-planner-test';

beforeEach(() => {
	ddbMock.reset();
});

describe('createProject', () => {
	it('sends PutCommand with id/name/color and attribute_not_exists guard', async () => {
		ddbMock.on(PutCommand).resolves({});

		const result = await createProject(ORG, { name: 'Project A', color: '#ff0000' });

		expect(result).toMatchObject({ name: 'Project A', color: '#ff0000' });
		const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
		expect(input.TableName).toBe(TABLE);
		expect(input.ConditionExpression).toBe('attribute_not_exists(sk)');
		expect(input.Item).toMatchObject({
			pk: `ORG#${ORG}`,
			sk: `PRJ#${result.id}`,
			id: result.id,
			name: 'Project A',
			color: '#ff0000'
		});
	});
});

describe('updateProject', () => {
	it('sends UpdateCommand with #name + color in SET, attribute_exists guard', async () => {
		ddbMock.on(UpdateCommand).resolves({});

		await updateProject(ORG, { id: 'prj-1', name: 'Renamed', color: '#00ff00' });

		const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
		expect(input.Key).toEqual({ pk: `ORG#${ORG}`, sk: 'PRJ#prj-1' });
		expect(input.UpdateExpression).toBe('SET #name = :name, color = :color');
		expect(input.ExpressionAttributeNames).toEqual({ '#name': 'name' });
		expect(input.ExpressionAttributeValues).toEqual({
			':name': 'Renamed',
			':color': '#00ff00'
		});
		expect(input.ConditionExpression).toBe('attribute_exists(sk)');
	});
});

describe('deleteProject (cascade)', () => {
	it('queries by projectId then transact-deletes project + assignments atomically', async () => {
		ddbMock.on(QueryCommand).resolves({
			Items: [{ sk: 'ASN#2026-05-01#a1' }, { sk: 'ASN#2026-05-10#a2' }]
		});
		ddbMock.on(TransactWriteCommand).resolves({});

		await deleteProject(ORG, 'prj-1');

		const qInput = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
		expect(qInput.FilterExpression).toBe('projectId = :pid');
		expect(qInput.ExpressionAttributeValues).toMatchObject({
			':pk': `ORG#${ORG}`,
			':asn': 'ASN#',
			':pid': 'prj-1'
		});

		const txInput = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
		expect(txInput.TransactItems).toEqual([
			{ Delete: { TableName: TABLE, Key: { pk: `ORG#${ORG}`, sk: 'PRJ#prj-1' } } },
			{ Delete: { TableName: TABLE, Key: { pk: `ORG#${ORG}`, sk: 'ASN#2026-05-01#a1' } } },
			{ Delete: { TableName: TABLE, Key: { pk: `ORG#${ORG}`, sk: 'ASN#2026-05-10#a2' } } }
		]);
	});

	it('throws when cascade exceeds 100 items', async () => {
		const items = Array.from({ length: 100 }, (_, i) => ({ sk: `ASN#2026-05-01#a${i}` }));
		ddbMock.on(QueryCommand).resolves({ Items: items });

		await expect(deleteProject(ORG, 'prj-1')).rejects.toThrow(/exceeds 100 items/);
		expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
	});
});
