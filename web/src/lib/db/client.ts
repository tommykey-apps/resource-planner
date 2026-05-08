import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { env } from '$env/dynamic/private';

if (!env.DYNAMODB_TABLE) {
	throw new Error('DYNAMODB_TABLE env not set');
}

// AWS SDK v3 は AWS_ENDPOINT_URL を自動認識する (v3.385+)。
// 本番 (Lambda): IAM role + env なし → 本番 DynamoDB
// 開発 (DynamoDB Local): AWS_ENDPOINT_URL=http://localhost:8000 を .env で渡す
const client = new DynamoDBClient({});

export const ddb = DynamoDBDocumentClient.from(client, {
	marshallOptions: {
		// undefined を attribute から落として、空 string も無視しない (DynamoDB は空 string OK)
		removeUndefinedValues: true
	}
});

export const TABLE = env.DYNAMODB_TABLE;
