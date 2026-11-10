import { promises as fs } from 'node:fs';

/**
 * E2E fixture: dev sendVerificationRequest が `AUTH_TEST_MAGIC_LINK_FILE` に append した
 * tab 区切り `{email}\t{url}` ログから、対象 email の最新 URL を取り出す (#113)。
 *
 * Auth.js は token を hash 化して DDB に保存するため、URL の平文 token は送信側でしか取得できない。
 * fixture から POST → check-email 遷移 → file polling → URL 取得 → goto、という flow で
 * sign-in 完了させる。
 */
export const MAGIC_LINK_FILE = process.env.AUTH_TEST_MAGIC_LINK_FILE!;

if (!MAGIC_LINK_FILE) {
	throw new Error(
		'AUTH_TEST_MAGIC_LINK_FILE env must be set. playwright.config.ts で設定済のはずです。'
	);
}

export async function clearMagicLinks(): Promise<void> {
	await fs.writeFile(MAGIC_LINK_FILE, '');
}

/**
 * 指定 email の最新 magic link URL を返す。preview server が token を書くまで poll で待つ。
 */
export async function getMagicLinkUrl(email: string, timeoutMs = 5000): Promise<string> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const content = await fs.readFile(MAGIC_LINK_FILE, 'utf-8').catch(() => '');
		const lines = content.split('\n').filter(Boolean);
		for (let i = lines.length - 1; i >= 0; i--) {
			const [id, url] = lines[i].split('\t');
			if (id === email && url) return url;
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error(`Magic link for ${email} not captured within ${timeoutMs}ms`);
}
