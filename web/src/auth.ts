/**
 * Auth.js 設定の入り口 (#65 / #79 / #81 / #83)。
 *
 * PR-A3 (本 PR) で Nodemailer (Magic Link) provider を有効化、ドメイン制限と初回 sign-in 時の
 * default team 自動 join を組み込む。Clerk と並行稼働中、Clerk 撤去は PR-A5。
 *
 * - PR-A4: SES SMTP / SSM AUTH_SECRET / IAM 配備
 * - PR-A5: Clerk 完全撤去 + Magic Link を default sign-in にする UI 切替 + ADR 0008/0009
 */
import { SvelteKitAuth } from '@auth/sveltekit';
import Nodemailer from '@auth/sveltekit/providers/nodemailer';
import { DynamoDBAdapter } from '@auth/dynamodb-adapter';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { env } from '$env/dynamic/private';
import { addMembership, DEFAULT_TEAM_ID, getOrCreateDefaultTeam } from '$lib/repository/team';

/**
 * 許可ドメイン判定 (純粋関数、テストしやすい形で抽出)。
 *
 * `email` の末尾が `@{allowed}` (case-insensitive) と一致するときのみ true。
 * `allowed` が未設定なら **常に false** (fail-closed: 安全側に倒す)。
 */
export function isDomainAllowed(
	email: string | null | undefined,
	allowed: string | null | undefined
): boolean {
	if (!email || !allowed) return false;
	return email.toLowerCase().endsWith(`@${allowed.toLowerCase()}`);
}

const adapterClient = DynamoDBDocument.from(new DynamoDBClient({}), {
	marshallOptions: {
		convertEmptyValues: true,
		removeUndefinedValues: true,
		convertClassInstanceToMap: true
	}
});

// dev / test では SMTP がないので magic link URL を console に出力する。
// production (PR-A4) では EMAIL_SERVER を設定して default Nodemailer transport で送信。
const useDevTransport = !env.EMAIL_SERVER;

export const { handle, signIn, signOut } = SvelteKitAuth({
	adapter: DynamoDBAdapter(adapterClient, {
		tableName: env.DYNAMODB_TABLE
	}),
	providers: [
		Nodemailer({
			server: env.EMAIL_SERVER ?? 'smtp://localhost:1025',
			from: env.EMAIL_FROM ?? 'noreply@example.com',
			...(useDevTransport
				? {
						sendVerificationRequest: async ({ identifier, url }) => {
							// eslint-disable-next-line no-console
							console.log(
								`\n[Magic Link DEV] to=${identifier}\n  ${url}\n  (production は SES SMTP で送信、PR-A4 で配備)\n`
							);
						}
					}
				: {})
		})
	],
	pages: {
		signIn: '/sign-in',
		verifyRequest: '/sign-in/check-email',
		error: '/sign-in/error'
	},
	callbacks: {
		signIn: async ({ user }) => {
			// 許可ドメインのみ通過 (env.ALLOWED_DOMAIN、PR-A1 で配置済)
			if (!isDomainAllowed(user.email, env.ALLOWED_DOMAIN)) {
				return false;
			}
			return true;
		},
		// session に teamId を載せる。PR-A2 で hardcode した default team を使う想定。
		// 将来 multi-team 対応では last-used team を session に保存する別 PR で。
		session: async ({ session }) => {
			return session;
		}
	},
	events: {
		// 初回 sign-in 時 (User が DDB adapter で作成された直後) に default team へ自動 join。
		signIn: async ({ user, isNewUser }) => {
			if (!user.id) return;
			// 既存 user の毎回 sign-in でも idempotent (Put without Condition)。
			// isNewUser だけにすると、過去 invite された user が初回 sign-in したケースで
			// membership が無いことになるためスキップしない。
			void isNewUser;
			try {
				await getOrCreateDefaultTeam();
				await addMembership(DEFAULT_TEAM_ID, user.id, 'member');
			} catch (e) {
				// 失敗してもサインイン自体は成功させる (membership は再 sign-in 時に再試行)。
				// eslint-disable-next-line no-console
				console.error('[auth.events.signIn] failed to add default team membership', e);
			}
		}
	},
	trustHost: true
});
