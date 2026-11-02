/**
 * Lambda Web Function の入口。配布物の直下に index.js として置かれ、runtime が最初に読み込む。
 *
 * adapter-node の出力 (build/index.js) は HOST と PORT を読んで待ち受ける。
 * Web Functions は待ち受け先を AWS_LAMBDA_HTTP_ENDPOINT でしか渡さないので、ここで書き換えてから読み込む。
 * Refs:
 * - https://docs.aws.amazon.com/lambda/latest/dg/web-functions-runtimes.html
 * - https://svelte.dev/docs/kit/adapter-node#Environment-variables
 */
import { parseListenAddress } from './listen-address';

const { host, port } = parseListenAddress(process.env.AWS_LAMBDA_HTTP_ENDPOINT);
process.env.HOST = host;
process.env.PORT = port;

// 配布物の中での相対パス。build/ はビルド後にしか存在しないので、変数で渡して
// 型検査と esbuild (scripts/package-web-function.mjs) が解決しないようにする
const serverEntry = './build/index.js';
await import(serverEntry);
