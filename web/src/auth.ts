/**
 * Auth.js 設定の入り口 (#65 / #79 / #81 / #83 / #85)。
 *
 * PR-A4 (本 PR) で **production infra** (SSM AUTH_SECRET + SES SDK 経由送信) を実装。
 * Clerk と並行稼働中、Clerk 撤去は PR-A5。
 *
 * - dev / test: env から AUTH_SECRET 直接 / sendVerificationRequest を console.log
 * - production (Lambda): env.AUTH_SECRET 未設定 + env.AUTH_SECRET_PARAM 設定
 *   → SSM SecureString から resolve、sendVerificationRequest を SES SDK で送信
 */
import { SvelteKitAuth } from '@auth/sveltekit';
import Nodemailer from '@auth/sveltekit/providers/nodemailer';
import { DynamoDBAdapter } from '@auth/dynamodb-adapter';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
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

// ── AUTH_SECRET resolution ──
// production: env.AUTH_SECRET_PARAM (SSM SecureString) を top-level await で fetch。
// dev / test:  env.AUTH_SECRET をそのまま使う (vite.config.ts で test 用ダミー注入済)。
let resolvedAuthSecret = env.AUTH_SECRET;
if (!resolvedAuthSecret && env.AUTH_SECRET_PARAM) {
	const ssm = new SSMClient({});
	const out = await ssm.send(
		new GetParameterCommand({ Name: env.AUTH_SECRET_PARAM, WithDecryption: true })
	);
	resolvedAuthSecret = out.Parameter?.Value;
	if (!resolvedAuthSecret) {
		throw new Error(`AUTH_SECRET could not be resolved from SSM param ${env.AUTH_SECRET_PARAM}`);
	}
}

const adapterClient = DynamoDBDocument.from(new DynamoDBClient({}), {
	marshallOptions: {
		convertEmptyValues: true,
		removeUndefinedValues: true,
		convertClassInstanceToMap: true
	}
});

// transport 選択:
// - dev / test (`!env.EMAIL_SERVER` かつ `!env.EMAIL_FROM` が tommykeyapp.com 形式でない):
//   sendVerificationRequest を console.log で stub
// - production (Lambda):
//   env.EMAIL_FROM が tommykeyapp.com 形式 + AWS region 解決可 → SES SDK 経由
const isProductionTransport =
	!!env.EMAIL_FROM && env.EMAIL_FROM.endsWith('@tommykeyapp.com') && !env.EMAIL_SERVER;

const sesClient = isProductionTransport ? new SESv2Client({}) : null;

async function sendMagicLinkViaSES(params: { identifier: string; url: string }): Promise<void> {
	if (!sesClient) throw new Error('SES client not initialized');
	const subject = 'サインインリンク - resource-planner';
	const text = `resource-planner にサインインするには以下のリンクをクリックしてください:\n\n${params.url}\n\nこのリンクは 24 時間で失効します。\n身に覚えがない場合は無視してください。\n`;
	const html = `<p>resource-planner にサインインするには以下のリンクをクリックしてください:</p>
<p><a href="${params.url}">${params.url}</a></p>
<p style="font-size:12px;color:#666;">このリンクは 24 時間で失効します。<br>身に覚えがない場合は無視してください。</p>`;

	await sesClient.send(
		new SendEmailCommand({
			FromEmailAddress: env.EMAIL_FROM,
			Destination: { ToAddresses: [params.identifier] },
			Content: {
				Simple: {
					Subject: { Data: subject, Charset: 'UTF-8' },
					Body: {
						Text: { Data: text, Charset: 'UTF-8' },
						Html: { Data: html, Charset: 'UTF-8' }
					}
				}
			}
		})
	);
}

export const { handle, signIn, signOut } = SvelteKitAuth({
	secret: resolvedAuthSecret,
	adapter: DynamoDBAdapter(adapterClient, {
		tableName: env.DYNAMODB_TABLE
	}),
	providers: [
		Nodemailer({
			// SMTP server 設定は production では SES SDK 経由で send するため未使用。
			// Auth.js が provider 初期化時に server 値を要求するため dummy を渡す。
			server: env.EMAIL_SERVER ?? 'smtp://placeholder:25',
			from: env.EMAIL_FROM ?? 'noreply@example.com',
			sendVerificationRequest: isProductionTransport
				? sendMagicLinkViaSES
				: async ({ identifier, url }) => {
						// eslint-disable-next-line no-console
						console.log(
							`\n[Magic Link DEV] to=${identifier}\n  ${url}\n  (production は SES SDK で送信)\n`
						);
					}
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
		session: async ({ session }) => {
			return session;
		}
	},
	events: {
		// 初回 sign-in 時 (User が DDB adapter で作成された直後) に default team へ自動 join。
		signIn: async ({ user, isNewUser }) => {
			if (!user.id) return;
			// 既存 user の毎回 sign-in でも idempotent (Put without Condition)。
			// isNewUser だけに絞ると、過去 invite された user の初回 sign-in でメンバーシップ
			// が抜けるリスクがあるため毎回試行する。
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
