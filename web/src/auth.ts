/**
 * Auth.js 設定の入り口 (#65 / #79 / #81)。
 *
 * 本ファイルは Clerk と並行稼働中。providers が空のため Auth.js 経由の sign-in は実行できない。
 * - PR-A2 (本): DynamoDB adapter を有効化 (GSI1 スキーマ追加とセット)
 * - PR-A3: Nodemailer (Magic Link) provider 追加 + sign-in UI
 * - PR-A4: Infra (SES + SSM AUTH_SECRET)
 * - PR-A5: Clerk 完全撤去 + ADR 0008/0009
 *
 * 既存 Clerk サインインフローは hooks.server.ts の sequence で維持される。
 */
import { SvelteKitAuth } from '@auth/sveltekit';
import { DynamoDBAdapter } from '@auth/dynamodb-adapter';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { env } from '$env/dynamic/private';

// adapter は Document client を要求 (key marshalling 簡略化のため)。
// TABLE 名は既存 db/client.ts と共有、attribute 名 (pk/sk/GSI1PK/GSI1SK/expires) は adapter デフォルト
// と一致させているため options は不要 (Auth.js docs 確認済)。
const adapterClient = DynamoDBDocument.from(new DynamoDBClient({}), {
	marshallOptions: {
		convertEmptyValues: true,
		removeUndefinedValues: true,
		convertClassInstanceToMap: true
	}
});

export const { handle, signIn, signOut } = SvelteKitAuth({
	adapter: DynamoDBAdapter(adapterClient, {
		tableName: env.DYNAMODB_TABLE
	}),
	providers: [],
	trustHost: true
});
