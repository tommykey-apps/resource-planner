/**
 * #181: SES suppression item の DDB shape を 1 箇所に集約。
 *
 * 旧: `putSuppression` 相当のロジックが 2 ファイル別実装で散在していた:
 *   - `lib/repository/suppression.ts` (本体 app、 `$lib/db/client` 経由で DDB Put)
 *   - `lambda/ses-bounce-handler.ts` (別 Lambda artifact、 esbuild bundle)
 * いずれも同じ pk / sk / attributes を持つ DDB item を構築していて、 片方更新時に
 * 他方が忘れられる risk があった。
 *
 * 本モジュールは **pure** ($app/... を一切 import しない) に保ち、 両 Lambda artifact が
 * 同じ item shape を生成することを保証する。 PutCommand 自体は呼び出し側の DDB client で
 * 実行する。
 */
import { suppressionMetaSk, suppressionPk } from './keys';

export type SuppressionInput = {
	/** 元アドレス (mixed case は保持しつつ pk は lower-case 化)。 */
	email: string;
	reason: 'bounce' | 'complaint';
	/** SES bounceType: 'Permanent' (hard) のときだけ保存。 'Transient' (soft) は呼び出し側で弾く。 */
	bounceType?: 'Permanent' | 'Transient' | 'Undetermined';
	bounceSubType?: string;
	complaintFeedbackType?: string;
	/** SES event 発生時刻 (ISO 8601)。 SES の bounce.timestamp / complaint.timestamp を使う。 */
	timestamp: string;
};

export function buildSuppressionItem(input: SuppressionInput): Record<string, unknown> {
	return {
		pk: suppressionPk(input.email),
		sk: suppressionMetaSk(),
		email: input.email,
		reason: input.reason,
		bounceType: input.bounceType,
		bounceSubType: input.bounceSubType,
		complaintFeedbackType: input.complaintFeedbackType,
		timestamp: input.timestamp
	};
}
