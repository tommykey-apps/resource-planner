/**
 * Lambda Web Functions の待ち受け先 (AWS_LAMBDA_HTTP_ENDPOINT = "host:port") を host と port に分ける。
 * IPv6 の host はコロンを含むので、最後のコロンで分ける。
 * Refs: https://docs.aws.amazon.com/lambda/latest/dg/web-functions-revisions-env-vars.html
 */
export function parseListenAddress(endpoint: string | undefined): { host: string; port: string } {
	const colon = endpoint?.lastIndexOf(':') ?? -1;
	const host = endpoint?.slice(0, colon) ?? '';
	const port = endpoint?.slice(colon + 1) ?? '';
	if (colon < 0 || host === '' || !/^\d+$/.test(port)) {
		throw new Error(
			`AWS_LAMBDA_HTTP_ENDPOINT must be "host:port" (got: "${endpoint ?? '<unset>'}")`
		);
	}
	return { host, port };
}
