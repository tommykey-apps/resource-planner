/**
 * Module-level DynamoDB env guard (#135 で #125 を強化)。
 *
 * このモジュールを **副作用 import** する (`import './guard'` または `import '$lib/db/guard'`)
 * だけで、 module 評価時に `assertSafeDbEnv` が発火する。
 *
 * 目的: `client.ts` と `auth.ts` の両方で別々に DynamoDBClient を構築しているため、
 * guard を片方だけに置くと bypass される。両方の最上位 import に本ファイルを置くことで、
 * どちらのコードパスでも guard が確実に通る。
 */
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { assertSafeDbEnv } from './env-guard';

if (!building) {
	assertSafeDbEnv({
		isLambda: !!process.env.AWS_LAMBDA_FUNCTION_NAME,
		endpoint: env.AWS_ENDPOINT_URL
	});
}
