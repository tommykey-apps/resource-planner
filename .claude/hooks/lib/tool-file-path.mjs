// hook の入力 (stdin の JSON) から `tool_input.file_path` を取り出して標準出力に書く。
// 無ければ何も書かない。Claude Code は flox の外で hook を動かすので、jq ではなく
// このリポジトリの前提である Node で読む。
// 入力の形: https://code.claude.com/docs/en/hooks#pretooluse-input
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
	const filePath = JSON.parse(raw)?.tool_input?.file_path;
	if (typeof filePath === 'string') process.stdout.write(filePath);
});
