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
const TEAM = 'team-test';
const TABLE = process.env.DYNAMODB_TABLE ?? 'resource-planner-test';

beforeEach(() => {
	ddbMock.reset();
});

describe('createProject', () => {
	it('stores id/name/color only when description/tags/links empty', async () => {
		ddbMock.on(PutCommand).resolves({});

		const result = await createProject(TEAM, {
			name: 'Project A',
			color: '#ff0000',
			description: undefined,
			tags: [],
			links: []
		});

		expect(result).toMatchObject({ name: 'Project A', color: '#ff0000' });
		expect(result).not.toHaveProperty('description');
		expect(result).not.toHaveProperty('tags');
		expect(result).not.toHaveProperty('links');
		const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
		expect(input.TableName).toBe(TABLE);
		expect(input.ConditionExpression).toBe('attribute_not_exists(sk)');
		expect(input.Item).toMatchObject({
			pk: `TEAM#${TEAM}`,
			sk: `PRJ#${result.id}`,
			id: result.id,
			name: 'Project A',
			color: '#ff0000'
		});
		expect(input.Item).not.toHaveProperty('description');
		expect(input.Item).not.toHaveProperty('tags');
		expect(input.Item).not.toHaveProperty('links');
	});

	it('stores description/tags/links when provided', async () => {
		ddbMock.on(PutCommand).resolves({});

		const links = [{ label: 'Wiki', url: 'https://example.com/wiki' }];
		const result = await createProject(TEAM, {
			name: 'Project B',
			color: '#00ff00',
			description: '## Tech\n- TypeScript',
			tags: ['TypeScript', 'AWS'],
			links
		});

		expect(result).toMatchObject({
			name: 'Project B',
			color: '#00ff00',
			description: '## Tech\n- TypeScript',
			tags: ['TypeScript', 'AWS'],
			links
		});
		const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
		expect(input.Item).toMatchObject({
			description: '## Tech\n- TypeScript',
			tags: ['TypeScript', 'AWS'],
			links
		});
	});
});

describe('updateProject', () => {
	it('SETs name/color and REMOVEs description/tags/links when all detail empty', async () => {
		ddbMock.on(UpdateCommand).resolves({});

		await updateProject(TEAM, {
			id: 'prj-1',
			name: 'Renamed',
			color: '#00ff00',
			description: undefined,
			tags: [],
			links: []
		});

		const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
		expect(input.Key).toEqual({ pk: `TEAM#${TEAM}`, sk: 'PRJ#prj-1' });
		expect(input.UpdateExpression).toBe(
			'SET #name = :name, color = :color REMOVE description, tags, links'
		);
		expect(input.ExpressionAttributeNames).toEqual({ '#name': 'name' });
		expect(input.ExpressionAttributeValues).toEqual({
			':name': 'Renamed',
			':color': '#00ff00'
		});
		expect(input.ConditionExpression).toBe('attribute_exists(sk)');
	});

	it('SETs all attributes when description/tags/links provided', async () => {
		ddbMock.on(UpdateCommand).resolves({});

		const links = [{ url: 'https://example.com' }];
		await updateProject(TEAM, {
			id: 'prj-1',
			name: 'Renamed',
			color: '#00ff00',
			description: 'desc',
			tags: ['t1'],
			links
		});

		const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
		expect(input.UpdateExpression).toBe(
			'SET #name = :name, color = :color, description = :description, tags = :tags, links = :links'
		);
		expect(input.ExpressionAttributeValues).toEqual({
			':name': 'Renamed',
			':color': '#00ff00',
			':description': 'desc',
			':tags': ['t1'],
			':links': links
		});
	});

	it('mixes SET and REMOVE per-attribute (description SET, tags+links REMOVE)', async () => {
		ddbMock.on(UpdateCommand).resolves({});

		await updateProject(TEAM, {
			id: 'prj-1',
			name: 'Renamed',
			color: '#00ff00',
			description: 'desc only',
			tags: [],
			links: []
		});

		const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
		expect(input.UpdateExpression).toBe(
			'SET #name = :name, color = :color, description = :description REMOVE tags, links'
		);
		expect(input.ExpressionAttributeValues).toEqual({
			':name': 'Renamed',
			':color': '#00ff00',
			':description': 'desc only'
		});
	});

	it('treats empty-string description as REMOVE (defense in depth)', async () => {
		ddbMock.on(UpdateCommand).resolves({});

		await updateProject(TEAM, {
			id: 'prj-1',
			name: 'Renamed',
			color: '#00ff00',
			description: '',
			tags: [],
			links: []
		});

		const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
		expect(input.UpdateExpression).toBe(
			'SET #name = :name, color = :color REMOVE description, tags, links'
		);
		expect(input.ExpressionAttributeValues).toEqual({
			':name': 'Renamed',
			':color': '#00ff00'
		});
	});
});

describe('deleteProject (cascade)', () => {
	it('queries by projectId then transact-deletes project + assignments atomically', async () => {
		ddbMock.on(QueryCommand).resolves({
			Items: [{ sk: 'ASN#2026-05-01#a1' }, { sk: 'ASN#2026-05-10#a2' }]
		});
		ddbMock.on(TransactWriteCommand).resolves({});

		await deleteProject(TEAM, 'prj-1');

		const qInput = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
		expect(qInput.FilterExpression).toBe('projectId = :pid');
		expect(qInput.ExpressionAttributeValues).toMatchObject({
			':pk': `TEAM#${TEAM}`,
			':asn': 'ASN#',
			':pid': 'prj-1'
		});

		const txInput = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
		expect(txInput.TransactItems).toEqual([
			{ Delete: { TableName: TABLE, Key: { pk: `TEAM#${TEAM}`, sk: 'PRJ#prj-1' } } },
			{ Delete: { TableName: TABLE, Key: { pk: `TEAM#${TEAM}`, sk: 'ASN#2026-05-01#a1' } } },
			{ Delete: { TableName: TABLE, Key: { pk: `TEAM#${TEAM}`, sk: 'ASN#2026-05-10#a2' } } }
		]);
	});

	it('throws when cascade exceeds 100 items', async () => {
		const items = Array.from({ length: 100 }, (_, i) => ({ sk: `ASN#2026-05-01#a${i}` }));
		ddbMock.on(QueryCommand).resolves({ Items: items });

		await expect(deleteProject(TEAM, 'prj-1')).rejects.toThrow(/exceeds 100 items/);
		expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
	});
});
