/**
 * Auth.js 設定の入り口 (#65 / #79)。
 *
 * 本ファイル (PR-A1) の役割は **構造の用意のみ**。Clerk と並行稼働させ、移行を段階的に進める:
 * - PR-A2: DynamoDB adapter + GSI1 を追加 (DB schema 拡張とセット)
 * - PR-A3: Nodemailer (Magic Link) provider 追加 + sign-in UI
 * - PR-A4: Infra (SES + SSM AUTH_SECRET)
 * - PR-A5: Clerk 完全撤去 + ADR 0008/0009
 *
 * 本 PR 時点では providers が空のため Auth.js 経由の sign-in は実行できない。
 * 既存 Clerk サインインフローはそのまま動作する (hooks.server.ts で sequence)。
 */
import { SvelteKitAuth } from '@auth/sveltekit';

export const { handle, signIn, signOut } = SvelteKitAuth({
	providers: [],
	trustHost: true
});
