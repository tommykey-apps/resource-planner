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
// 本番安全 guard を副作用 import で最上位に置く (#135、#125 の強化)。
// auth.ts は独立に DynamoDBClient を構築 (DDB adapter 経由) するので、 client.ts と同じ
// guard を必ず通すように import する。これを怠ると Auth.js が本番 DDB に到達する事故が再発する。
import '$lib/db/guard';
import { SvelteKitAuth } from '@auth/sveltekit';
import Nodemailer from '@auth/sveltekit/providers/nodemailer';
import { DynamoDBAdapter } from '@auth/dynamodb-adapter';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { promises as fs } from 'node:fs';
import { env } from '$env/dynamic/private';
import { addMembership, DEFAULT_TEAM_ID, getOrCreateDefaultTeam } from '$lib/repository/team';
import { isSuppressed } from '$lib/repository/suppression';

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

/**
 * sign-in を許可するか判定 (#134 で suppression check 追加)。
 *
 * 1. ドメイン許可リストに無い → 拒否
 * 2. SES suppression list (bounce / complaint) に該当 → 拒否 (magic link は送らない)
 * 3. それ以外 → 許可
 *
 * 副作用は `isSuppressed` の DDB Get のみ。 ロジックを純粋にして
 * SvelteKitAuth wrapper の外でも test 可能にする。
 */
export async function shouldAllowSignIn(
	email: string | null | undefined,
	allowed: string | null | undefined
): Promise<boolean> {
	if (!isDomainAllowed(email, allowed)) return false;
	if (email && (await isSuppressed(email))) return false;
	return true;
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

/**
 * dev / test 用 sendVerificationRequest。
 *
 * デフォルトは console.log で開発時に URL を出すだけ。E2E test 時は
 * `AUTH_TEST_MAGIC_LINK_FILE` を設定すると URL を tab 区切りでファイルへ append し、
 * Playwright fixture が読み取って magic link を踏めるようにする (#113)。
 * Auth.js は token を hash 化して DDB に保存するため、URL は送信側でしか平文を得られない。
 */
export async function sendMagicLinkDev(params: {
	identifier: string;
	url: string;
}): Promise<void> {
	// eslint-disable-next-line no-console
	console.log(
		`\n[Magic Link DEV] to=${params.identifier}\n  ${params.url}\n  (production は SES SDK で送信)\n`
	);
	// dev/test 専用 env のため SvelteKit $env (module load 時 snapshot) ではなく process.env を都度参照
	const file = process.env.AUTH_TEST_MAGIC_LINK_FILE;
	if (file) {
		await fs.appendFile(file, `${params.identifier}\t${params.url}\n`);
	}
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
			sendVerificationRequest: isProductionTransport ? sendMagicLinkViaSES : sendMagicLinkDev
		})
	],
	pages: {
		signIn: '/sign-in',
		verifyRequest: '/sign-in/check-email',
		error: '/sign-in/error'
	},
	callbacks: {
		signIn: async ({ user }) => shouldAllowSignIn(user.email, env.ALLOWED_DOMAIN),
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
