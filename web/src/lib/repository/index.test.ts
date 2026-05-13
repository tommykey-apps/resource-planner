import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryAllByTeam } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);
const TEAM = 'team-test';

beforeEach(() => {
	ddbMock.reset();
});

describe('queryAllByTeam', () => {
	it('partitions returned items by SK prefix into resources/projects/assignments', async () => {
		ddbMock.on(QueryCommand).resolves({
			Items: [
				{ sk: 'RES#r1', id: 'r1', name: 'Alice' },
				{ sk: 'RES#r2', id: 'r2', name: 'Bob' },
				{ sk: 'PRJ#p1', id: 'p1', name: 'Project A', color: '#ff0000' },
				{
					sk: 'ASN#2026-05-01#a1',
					id: 'a1',
					resourceId: 'r1',
					projectId: 'p1',
					startDate: '2026-05-01',
					endDateExclusive: '2026-06-01'
				}
			]
		});

		const data = await queryAllByTeam(TEAM);

		expect(data.resources).toEqual([
			{ id: 'r1', name: 'Alice' },
			{ id: 'r2', name: 'Bob' }
		]);
		expect(data.projects).toEqual([{ id: 'p1', name: 'Project A', color: '#ff0000' }]);
		expect(data.assignments).toEqual([
			{
				id: 'a1',
				resourceId: 'r1',
				projectId: 'p1',
				startDate: '2026-05-01',
				endDateExclusive: '2026-06-01'
			}
		]);

		const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
		expect(input.KeyConditionExpression).toBe('pk = :pk');
		expect(input.ExpressionAttributeValues).toEqual({ ':pk': `TEAM#${TEAM}` });
	});

	it('paginates via LastEvaluatedKey until exhausted', async () => {
		ddbMock
			.on(QueryCommand)
			.resolvesOnce({
				Items: [{ sk: 'RES#r1', id: 'r1', name: 'Alice' }],
				LastEvaluatedKey: { pk: `TEAM#${TEAM}`, sk: 'RES#r1' }
			})
			.resolvesOnce({
				Items: [{ sk: 'RES#r2', id: 'r2', name: 'Bob' }]
			});

		const data = await queryAllByTeam(TEAM);

		expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(2);
		expect(data.resources).toEqual([
			{ id: 'r1', name: 'Alice' },
			{ id: 'r2', name: 'Bob' }
		]);
	});

	it('returns empty arrays when no items exist', async () => {
		ddbMock.on(QueryCommand).resolves({ Items: [] });

		const data = await queryAllByTeam(TEAM);

		expect(data).toEqual({ resources: [], projects: [], assignments: [] });
	});

	it('ignores items with unknown SK prefix', async () => {
		ddbMock.on(QueryCommand).resolves({
			Items: [
				{ sk: 'RES#r1', id: 'r1', name: 'Alice' },
				{ sk: 'UNKNOWN#x', id: 'x' }
			]
		});

		const data = await queryAllByTeam(TEAM);
		expect(data.resources).toHaveLength(1);
		expect(data.projects).toHaveLength(0);
		expect(data.assignments).toHaveLength(0);
	});

	// Project optional fields (description / tags / links) round-trip (refs #196)
	it('returns project with description/tags/links when DDB item has them', async () => {
		ddbMock.on(QueryCommand).resolves({
			Items: [
				{
					sk: 'PRJ#p1',
					id: 'p1',
					name: 'Project A',
					color: '#ff0000',
					description: 'Test description',
					tags: ['ts', 'aws'],
					links: [{ url: 'https://example.com', label: 'Wiki' }]
				}
			]
		});

		const data = await queryAllByTeam(TEAM);

		expect(data.projects).toHaveLength(1);
		expect(data.projects[0]).toEqual({
			id: 'p1',
			name: 'Project A',
			color: '#ff0000',
			description: 'Test description',
			tags: ['ts', 'aws'],
			links: [{ url: 'https://example.com', label: 'Wiki' }]
		});
	});

	it('omits optional fields for legacy item (back-compat: id/name/color only)', async () => {
		ddbMock.on(QueryCommand).resolves({
			Items: [{ sk: 'PRJ#p1', id: 'p1', name: 'Legacy Project', color: '#00ff00' }]
		});

		const data = await queryAllByTeam(TEAM);

		expect(data.projects[0]).toEqual({ id: 'p1', name: 'Legacy Project', color: '#00ff00' });
		expect(data.projects[0]).not.toHaveProperty('description');
		expect(data.projects[0]).not.toHaveProperty('tags');
		expect(data.projects[0]).not.toHaveProperty('links');
	});

	it('skips empty list attributes from result (defense: write-side uses REMOVE)', async () => {
		// 万が一 write が REMOVE せず empty list `[]` を保存していても、 read 側で取り除く
		ddbMock.on(QueryCommand).resolves({
			Items: [
				{
					sk: 'PRJ#p1',
					id: 'p1',
					name: 'Project A',
					color: '#ff0000',
					tags: [],
					links: []
				}
			]
		});

		const data = await queryAllByTeam(TEAM);

		expect(data.projects[0]).toEqual({ id: 'p1', name: 'Project A', color: '#ff0000' });
		expect(data.projects[0]).not.toHaveProperty('tags');
		expect(data.projects[0]).not.toHaveProperty('links');
	});

	it('returns partial optional fields when only some are present', async () => {
		ddbMock.on(QueryCommand).resolves({
			Items: [
				{
					sk: 'PRJ#p1',
					id: 'p1',
					name: 'Project A',
					color: '#ff0000',
					description: 'desc only'
					// tags / links absent
				}
			]
		});

		const data = await queryAllByTeam(TEAM);

		expect(data.projects[0]).toEqual({
			id: 'p1',
			name: 'Project A',
			color: '#ff0000',
			description: 'desc only'
		});
		expect(data.projects[0]).not.toHaveProperty('tags');
		expect(data.projects[0]).not.toHaveProperty('links');
	});
});
