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

export type SuppressionReason = 'bounce' | 'complaint';

export interface SuppressionRecord {
	email: string; // 元アドレス (mixed case は保持しつつ pk は lower-case)
	reason: SuppressionReason;
	/** SES bounceType: 'Permanent' (hard) のときだけ保存。 'Transient' (soft) は呼び出し側で弾く。 */
	bounceType?: 'Permanent' | 'Transient' | 'Undetermined';
	bounceSubType?: string;
	complaintFeedbackType?: string;
	/** SES event 発生時刻 (ISO 8601)。 SES の bounce.timestamp を使う。 */
	timestamp: string;
}

export async function putSuppression(record: SuppressionRecord): Promise<void> {
	await ddb.send(
		new PutCommand({
			TableName: TABLE,
			Item: {
				pk: suppressionPk(record.email),
				sk: suppressionMetaSk(),
				email: record.email,
				reason: record.reason,
				bounceType: record.bounceType,
				bounceSubType: record.bounceSubType,
				complaintFeedbackType: record.complaintFeedbackType,
				timestamp: record.timestamp
			}
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
