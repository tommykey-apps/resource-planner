/**
 * DynamoDB client 構築前の env 安全判定 (#125 / #135 / #143)。
 *
 * Lambda 環境 (= AWS Lambda runtime が複数の env を自動セットする) または local endpoint
 * (localhost / 127.x.x.x / IPv6 [::1]) のいずれかでないと throw する。
 *
 * 純粋関数として抽出 = 単体テスト容易、呼び出し側で signal 取得を行う。
 */

/**
 * #143: regex から URL parser ベースに昇格。 `127.000.000.001` (octal mix) / `[::1]` (IPv6) /
 * 既知の本番 host (amazonaws.com) を扱う。
 */
function isLocalEndpoint(endpoint: string): boolean {
	if (!endpoint) return false;
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	// scheme は http / https のみ受け付け (任意 scheme bypass を防ぐ)
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
	const host = url.hostname.toLowerCase();
	if (host === 'localhost') return true;
	// IPv6 localhost。Node の URL は `[::1]` (bracket あり) を hostname として返す。
	if (host === '[::1]' || host === '::1') return true;
	// IPv4 127.0.0.0/8 全域。Node の URL parser は octal/dec mix (`127.000.000.001`) を
	// `127.0.0.1` に normalize してくれるので `^127\.` で十分。
	if (/^127\./.test(host)) return true;
	// 本番ホストの明示拒否 (defense in depth): amazonaws.com を含むと即 false
	// (上記の localhost 系判定を通った後の追加ガード、念のため)
	return false;
}

/**
 * Lambda runtime 判定: 1 つの env だけだと dev 環境で攻撃者が手動 set すれば bypass 可能。
 * AWS Lambda runtime が **すべて** 自動 set する 3 つの marker を AND で判定して paranoid mode に。
 *
 * 本番 Lambda runtime では 3 つすべて自動 set されるので false negative なし。
 * dev 環境で 3 つ全部偽装するのは現実的に困難。
 */
export function detectLambda(envSnapshot: Record<string, string | undefined>): boolean {
	const a = !!envSnapshot.AWS_LAMBDA_FUNCTION_NAME;
	const b = !!envSnapshot.AWS_EXECUTION_ENV?.startsWith('AWS_Lambda_');
	const c = !!envSnapshot.LAMBDA_TASK_ROOT;
	return a && b && c;
}

export function assertSafeDbEnv(opts: {
	isLambda: boolean;
	endpoint: string | null | undefined;
}): void {
	if (opts.isLambda) return;
	const endpoint = opts.endpoint ?? '';
	if (isLocalEndpoint(endpoint)) return;
	throw new Error(
		`Refusing to construct DynamoDB client: not in Lambda ` +
			`(AWS_LAMBDA_FUNCTION_NAME + AWS_EXECUTION_ENV + LAMBDA_TASK_ROOT 揃ってない) ` +
			`and AWS_ENDPOINT_URL is not localhost / 127.x / [::1] ` +
			`(got: "${endpoint || '<unset>'}"). ` +
			`Set AWS_ENDPOINT_URL=http://localhost:8000 in web/.env.local for local dev.`
	);
}
