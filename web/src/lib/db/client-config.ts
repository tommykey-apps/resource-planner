/**
 * DynamoDB client 設定の単一ソース (#235)。
 *
 * 事故の経緯: AWS SDK は `process.env.AWS_ENDPOINT_URL` を自動認識するが、 SvelteKit dev
 * (`vite dev`) では `.env.local` が `$env/dynamic/private` には載っても **第三者ライブラリが
 * 読む `process.env` には確実には載らない**。 そのため SDK の env 自動検出に頼ると endpoint が
 * 伝わらず、 default endpoint + マシンの実 credentials で **本番 DynamoDB に接続**してしまう
 * (実際に発生)。
 *
 * 対策: `$env` から endpoint / region / credentials を読み、 SDK へ **明示的に渡す**。
 * さらに **SDK に渡すのと同じ endpoint** で `assertSafeDbEnv` を実行し、 guard と SDK の
 * 参照元を一致させる (#125 / #135 / #143 の副作用 guard を本 helper に統合 = 単一ソース)。
 */
import type { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { assertSafeDbEnv, detectLambda } from './env-guard';

const DEFAULT_REGION = 'ap-northeast-1';

/**
 * 解決済みの値から SDK 設定を組み立てる純粋関数 (副作用なし = テスト容易)。
 *
 * - endpoint あり (ローカル / DDB Local): endpoint + region + ダミー credentials を明示。
 *   credentials も明示することで、 マシンの実 credentials が誤って使われる余地を断つ。
 * - endpoint なし (Lambda 本番): `{}` を返し、 SDK の IAM role + runtime region に委ねる。
 */
export function buildDynamoConfig(input: {
	endpoint?: string;
	region?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
}): DynamoDBClientConfig {
	if (!input.endpoint) return {};
	return {
		endpoint: input.endpoint,
		region: input.region || DEFAULT_REGION,
		credentials: {
			accessKeyId: input.accessKeyId || 'local',
			secretAccessKey: input.secretAccessKey || 'local'
		}
	};
}

/**
 * SDK へ渡す DynamoDB client 設定。 guard を SDK と同じ endpoint で実行してから返す。
 * `client.ts` / `auth.ts` の両方がこれを使うことで本番誤接続を構造的に防ぐ。
 */
export function dynamoClientConfig(): DynamoDBClientConfig {
	const endpoint = env.AWS_ENDPOINT_URL || undefined;
	// build (postbuild analyse) 中は env が揃わないため guard を skip (Lambda 実行時に発火)。
	if (!building) {
		assertSafeDbEnv({ isLambda: detectLambda(process.env), endpoint });
	}
	return buildDynamoConfig({
		endpoint,
		region: env.AWS_REGION,
		accessKeyId: env.AWS_ACCESS_KEY_ID,
		secretAccessKey: env.AWS_SECRET_ACCESS_KEY
	});
}
