/**
 * Auth.js 設定の入り口 (#65 / #79 / #81 / #83 / #85 / #168)。
 * 認証は Email Magic Link 単体 (ADR 0008 で Clerk から移行済)。
 *
 * - dev / test: env.AUTH_SECRET を直接利用
 * - production (Lambda): env.AUTH_SECRET_PARAM (SSM SecureString) を
 *   **AWS Parameters and Secrets Lambda Extension** (layer + localhost HTTP server)
 *   経由で取得。 公式 docs (https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html):
 *     - GET http://localhost:2773/systemsmanager/parameters/get?name=...&withDecryption=true
 *     - Header: X-Aws-Parameters-Secrets-Token = $AWS_SESSION_TOKEN
 *     - Extension が 300s TTL でローカル cache + retry を持つ → SDK 不要、 cold start 短縮
 *
 * **重要**: Extension は INVOKE phase でのみ起動しているため top-level await では呼べない。
 * SvelteKitAuth は function-form (`async (event) => config`) で per-request に解決し、
 * 同 container 内では module-level Promise で memoize (1 回だけ extension に行く)。
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

// ── AUTH_SECRET resolution via AWS Parameters and Secrets Lambda Extension (#168) ──
//
// 公式 docs の Recommended Pattern: layer 経由の localhost HTTP endpoint を叩く。
// SDK は不要 (extension が SSM への retry / cache / decrypt を内包)。
//
// dev / test:    env.AUTH_SECRET があれば fetch せず直接返す
// production:    env.AUTH_SECRET_PARAM + AWS_SESSION_TOKEN が揃ったら extension へ GET
//
// `fetchAuthSecret` は pure (state を持たない) ので unit test しやすい。 module-level の
// memoize は別レイヤで行う (`getAuthSecret` 内 Promise キャッシュ)。
const EXTENSION_PORT = 2773;
const EXTENSION_HOST = `http://localhost:${EXTENSION_PORT}`;

export async function fetchAuthSecret({
	authSecret,
	authSecretParam,
	sessionToken
}: {
	authSecret: string | undefined;
	authSecretParam: string | undefined;
	sessionToken: string | undefined;
}): Promise<string> {
	if (authSecret) return authSecret;
	if (!authSecretParam) {
		throw new Error('Neither AUTH_SECRET nor AUTH_SECRET_PARAM is set');
	}
	if (!sessionToken) {
		throw new Error(
			'AWS_SESSION_TOKEN is required to fetch via Lambda Parameters and Secrets Extension'
		);
	}
	const url = `${EXTENSION_HOST}/systemsmanager/parameters/get?name=${encodeURIComponent(authSecretParam)}&withDecryption=true`;
	const res = await fetch(url, {
		headers: { 'X-Aws-Parameters-Secrets-Token': sessionToken }
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`Lambda Extension fetch failed: ${res.status} ${body}`.trim());
	}
	const data = (await res.json()) as { Parameter?: { Value?: string } };
	const value = data.Parameter?.Value;
	if (!value) {
		throw new Error('Lambda Extension response missing Parameter.Value');
	}
	return value;
}

// Lambda container の寿命 (数分〜数時間) 内では SSM 値は変わらない前提で永続 memoize。
// fail 時は cache せず次回再試行 (extension が SSM 障害から復旧したら成功する)。
let cachedSecretPromise: Promise<string> | undefined;
function getAuthSecret(): Promise<string> {
	if (!cachedSecretPromise) {
		cachedSecretPromise = fetchAuthSecret({
			authSecret: env.AUTH_SECRET,
			authSecretParam: env.AUTH_SECRET_PARAM,
			sessionToken: process.env.AWS_SESSION_TOKEN
		}).catch((e) => {
			cachedSecretPromise = undefined;
			throw e;
		});
	}
	return cachedSecretPromise;
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
export async function sendMagicLinkDev(params: { identifier: string; url: string }): Promise<void> {
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

// SvelteKitAuth function-form: per-request に config を build する (#168)。
// `secret` は extension fetch なので INVOKE phase でしか呼べない (top-level await NG)。
// adapter / providers / pages 等 secret に依存しない部分は module-level の不変値を再利用する。
export const { handle, signIn, signOut } = SvelteKitAuth(async () => ({
	secret: await getAuthSecret(),
	adapter: DynamoDBAdapter(adapterClient, {
		tableName: env.DYNAMODB_TABLE
	}),
	providers: [
		Nodemailer({
			// SMTP server 設定は production では SES SDK 経由で send するため未使用。
			// Auth.js が provider 初期化時に server 値を要求するため dummy を渡す。
			// #184: `server: {}` で代替可能か検証したが、 @auth/sveltekit@1.11.2 の Nodemailer
			// provider は string か `{ host, port, auth }` 形式の object を要求する型定義のため、
			// 空 object では TypeScript エラーになる。 dummy string で OK と判定 (active code path
			// では sendVerificationRequest override で SES SDK を呼ぶため SMTP 接続は発生しない)。
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
		// #184: session callback は将来 user に追加属性を載せる場合 (team / role 等) の hook 点。
		// 現状は素の session をそのまま返す = Auth.js default 挙動と等価で削除可能だが、 将来
		// 拡張時に「ここに足せばいい」 という navigation marker として明示的に残す。
		signIn: async ({ user }) => shouldAllowSignIn(user.email, env.ALLOWED_DOMAIN),
		session: async ({ session }) => session
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
}));
