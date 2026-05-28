import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
// #235: endpoint / credentials を $env から明示注入 + guard を単一ソース化 (旧 `./guard` 副作用を統合)。
import { dynamoClientConfig } from './client-config';

// SvelteKit の `analyse` ステップ (postbuild) はサーバーモジュールを top-level 評価するため、
// build 中は env チェックをスキップする (Lambda 実行時にのみ env が揃う)。
if (!building && !env.DYNAMODB_TABLE) {
	throw new Error('DYNAMODB_TABLE env not set');
}

// #235: SDK の AWS_ENDPOINT_URL 自動検出には頼らず、 $env の endpoint を明示的に渡す。
// (SvelteKit dev では .env.local が process.env に載らず本番接続する事故があったため)
const client = new DynamoDBClient(dynamoClientConfig());

export const ddb = DynamoDBDocumentClient.from(client, {
	marshallOptions: {
		// undefined を attribute から落として、空 string も無視しない (DynamoDB は空 string OK)
		removeUndefinedValues: true
	}
});

export const TABLE = env.DYNAMODB_TABLE!;
