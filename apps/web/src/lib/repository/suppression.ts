/**
 * SES suppression list (#134)。
 *
 * SES が bounce / complaint を SNS topic に通知 → Lambda が受けて本 repository 経由で
 * `SUPPRESS#{email}` レコードを DDB に Put する。 Auth.js の `signIn` callback で
 * `isSuppressed(email)` を見て、 該当アドレスへの magic link 送信を抑止する。
 *
 * - email は大小文字 insensitive に正規化 (`suppressionPk` 内で `toLowerCase()`)
 * - reason: 'bounce' は hard bounce のみ追加 (soft bounce は SES が自動 retry)
 * - reason: 'complaint' は spam 報告。 即追加
 */
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import { suppressionMetaSk, suppressionPk } from './keys';
import { buildSuppressionItem, type SuppressionInput } from './suppression-item';

export type SuppressionReason = 'bounce' | 'complaint';

// 後方互換 type alias (#181)。 既存呼び出し側との signature 互換を保つため。
export type SuppressionRecord = SuppressionInput;

export async function putSuppression(record: SuppressionRecord): Promise<void> {
	await ddb.send(
		new PutCommand({
			TableName: TABLE,
			Item: buildSuppressionItem(record)
		})
	);
}

export async function getSuppression(email: string): Promise<SuppressionRecord | null> {
	const res = await ddb.send(
		new GetCommand({
			TableName: TABLE,
			Key: { pk: suppressionPk(email), sk: suppressionMetaSk() }
		})
	);
	if (!res.Item) return null;
	return {
		email: res.Item.email,
		reason: res.Item.reason,
		bounceType: res.Item.bounceType,
		bounceSubType: res.Item.bounceSubType,
		complaintFeedbackType: res.Item.complaintFeedbackType,
		timestamp: res.Item.timestamp
	};
}

/** 軽量 check 用 (signIn callback で boolean だけ知りたい場合)。 */
export async function isSuppressed(email: string): Promise<boolean> {
	return (await getSuppression(email)) !== null;
}
