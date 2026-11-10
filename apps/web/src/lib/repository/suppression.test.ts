import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSuppression, isSuppressed, putSuppression } from './suppression';

const ddbMock = mockClient(DynamoDBDocumentClient);
const TABLE = process.env.DYNAMODB_TABLE ?? 'resource-planner-test';

beforeEach(() => {
	ddbMock.reset();
});

afterEach(() => {
	ddbMock.reset();
});

describe('putSuppression (#134)', () => {
	it('sends PutCommand with pk="SUPPRESS#{email lower}" sk="META" + attributes', async () => {
		ddbMock.on(PutCommand).resolves({});
		await putSuppression({
			email: 'Alice@Example.com',
			reason: 'bounce',
			bounceType: 'Permanent',
			bounceSubType: 'General',
			timestamp: '2026-05-12T00:00:00Z'
		});
		const calls = ddbMock.commandCalls(PutCommand);
		expect(calls).toHaveLength(1);
		const input = calls[0].args[0].input;
		expect(input.TableName).toBe(TABLE);
		expect(input.Item).toMatchObject({
			pk: 'SUPPRESS#alice@example.com',
			sk: 'META',
			email: 'Alice@Example.com',
			reason: 'bounce',
			bounceType: 'Permanent',
			bounceSubType: 'General',
			timestamp: '2026-05-12T00:00:00Z'
		});
	});

	it('complaint reason 用 attribute も書き込む', async () => {
		ddbMock.on(PutCommand).resolves({});
		await putSuppression({
			email: 'spam@example.com',
			reason: 'complaint',
			complaintFeedbackType: 'abuse',
			timestamp: '2026-05-12T01:00:00Z'
		});
		const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
		expect(input.Item).toMatchObject({
			pk: 'SUPPRESS#spam@example.com',
			reason: 'complaint',
			complaintFeedbackType: 'abuse'
		});
	});
});

describe('getSuppression (#134)', () => {
	it('returns null when no record found', async () => {
		ddbMock.on(GetCommand).resolves({ Item: undefined });
		expect(await getSuppression('nobody@example.com')).toBeNull();
	});

	it('returns record when DDB Item exists, mapping attributes back', async () => {
		ddbMock.on(GetCommand).resolves({
			Item: {
				pk: 'SUPPRESS#alice@example.com',
				sk: 'META',
				email: 'Alice@Example.com',
				reason: 'bounce',
				bounceType: 'Permanent',
				bounceSubType: 'NoEmail',
				timestamp: '2026-05-12T00:00:00Z'
			}
		});
		const r = await getSuppression('Alice@Example.com');
		expect(r).toEqual({
			email: 'Alice@Example.com',
			reason: 'bounce',
			bounceType: 'Permanent',
			bounceSubType: 'NoEmail',
			complaintFeedbackType: undefined,
			timestamp: '2026-05-12T00:00:00Z'
		});
	});

	it('GetCommand の Key は lower-case email で作られる (mixed case 入力でも hit)', async () => {
		ddbMock.on(GetCommand).resolves({ Item: undefined });
		await getSuppression('ALICE@EXAMPLE.COM');
		const input = ddbMock.commandCalls(GetCommand)[0].args[0].input;
		expect(input.Key).toEqual({ pk: 'SUPPRESS#alice@example.com', sk: 'META' });
	});
});

describe('isSuppressed (#134)', () => {
	it('true when record found', async () => {
		ddbMock.on(GetCommand).resolves({
			Item: {
				pk: 'SUPPRESS#alice@example.com',
				sk: 'META',
				email: 'alice@example.com',
				reason: 'bounce',
				timestamp: '2026-05-12T00:00:00Z'
			}
		});
		expect(await isSuppressed('alice@example.com')).toBe(true);
	});

	it('false when no record', async () => {
		ddbMock.on(GetCommand).resolves({ Item: undefined });
		expect(await isSuppressed('alice@example.com')).toBe(false);
	});
});
