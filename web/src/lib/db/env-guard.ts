/**
 * DynamoDB client 構築前の env 安全判定 (#125)。
 *
 * Lambda 環境 (= AWS Lambda runtime が `AWS_LAMBDA_FUNCTION_NAME` を自動セットする) または
 * local endpoint (localhost / 127.0.0.1) のいずれかでないと throw する。
 *
 * 目的: dev / preview / CI で env 注入失敗 (例: vite preview が .env.local を process.env に
 * 注入しない仕様) で AWS SDK が default credential chain に落ちて本番 AWS に到達する事故を防ぐ。
 *
 * 純粋関数として抽出 = 単体テスト容易、呼び出し側 (`client.ts`) で signal 取得を行う。
 */

const LOCAL_ENDPOINT_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;

export function assertSafeDbEnv(opts: {
	isLambda: boolean;
	endpoint: string | null | undefined;
}): void {
	if (opts.isLambda) return;
	const endpoint = opts.endpoint ?? '';
	if (LOCAL_ENDPOINT_PATTERN.test(endpoint)) return;
	throw new Error(
		`Refusing to construct DynamoDB client: not in Lambda ` +
			`(AWS_LAMBDA_FUNCTION_NAME unset) and AWS_ENDPOINT_URL is not localhost ` +
			`(got: "${endpoint || '<unset>'}"). ` +
			`Set AWS_ENDPOINT_URL=http://localhost:8000 in web/.env.local for local dev.`
	);
}
