/**
 * SES bounce / complaint handler (#134)。
 *
 * **役割**: SES → SNS topic → Lambda (本 entry) → DynamoDB suppression list。
 *
 * SES が送信した magic link メールが hard bounce (存在しないアドレス等) または spam complaint
 * を受けた場合、 SNS topic にイベントが publish される。 本 Lambda がそれを subscription で
 * 受け、 DDB に `SUPPRESS#{email}` レコードを Put する。
 *
 * **設計上の制約**:
 *   - 本 Lambda は SvelteKit と独立してるので `$lib/db/client` (= `$app/environment` 依存) は
 *     import できない。 DDB client / TABLE 名を直に持つ。
 *   - 一方で `suppressionPk` / `suppressionMetaSk` だけは `$lib/repository/keys` から
 *     import する。 これらは `$app/...` を import しない純粋関数で、 PK フォーマットを
 *     アプリ側と完全一致させる必要があるため (signIn callback での Get と整合)。
 *
 * **policy**:
 *   - **hard bounce のみ** suppression に追加 (`bounceType === 'Permanent'`)。
 *     `Transient` (一時的) は SES が自動 retry するため無視。
 *   - **complaint は全て追加** (spam 通報は user 意思の表明)。
 *   - **冪等**: Put は同 PK の上書きなので、 同じ通知が複数回届いても安全。
 *
 * SES bounce notification: https://docs.aws.amazon.com/ses/latest/dg/notification-contents.html
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { suppressionMetaSk, suppressionPk } from '$lib/repository/keys';

type SnsEventRecord = {
	Sns: {
		Message: string;
	};
};

export type SnsEvent = {
	Records: SnsEventRecord[];
};

type BouncedRecipient = {
	emailAddress: string;
	action?: string;
	status?: string;
	diagnosticCode?: string;
};

type BounceNotification = {
	notificationType: 'Bounce';
	bounce: {
		bounceType: 'Permanent' | 'Transient' | 'Undetermined';
		bounceSubType?: string;
		bouncedRecipients: BouncedRecipient[];
		timestamp: string;
		feedbackId?: string;
	};
};

type ComplainedRecipient = {
	emailAddress: string;
};

type ComplaintNotification = {
	notificationType: 'Complaint';
	complaint: {
		complainedRecipients: ComplainedRecipient[];
		timestamp: string;
		feedbackId?: string;
		complaintFeedbackType?: string;
	};
};

export type SesNotification = BounceNotification | ComplaintNotification;

export type SuppressionPutInput = {
	email: string;
	reason: 'bounce' | 'complaint';
	bounceType?: 'Permanent' | 'Transient' | 'Undetermined';
	bounceSubType?: string;
	complaintFeedbackType?: string;
	timestamp: string;
};

/**
 * 1 件の SES notification を処理して suppression list に書き込むべきアドレスを返す。
 * 副作用なし → 純粋関数として test しやすい。
 */
export function selectSuppressionsFromNotification(
	notification: SesNotification
): SuppressionPutInput[] {
	if (notification.notificationType === 'Bounce') {
		if (notification.bounce.bounceType !== 'Permanent') return [];
		return notification.bounce.bouncedRecipients.map((r) => ({
			email: r.emailAddress,
			reason: 'bounce' as const,
			bounceType: 'Permanent' as const,
			bounceSubType: notification.bounce.bounceSubType,
			timestamp: notification.bounce.timestamp
		}));
	}
	return notification.complaint.complainedRecipients.map((r) => ({
		email: r.emailAddress,
		reason: 'complaint' as const,
		complaintFeedbackType: notification.complaint.complaintFeedbackType,
		timestamp: notification.complaint.timestamp
	}));
}

// ── runtime DDB client (Lambda 起動時に 1 度初期化、 invocation 間で reuse) ──
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.DYNAMODB_TABLE ?? '';

export async function putSuppression(input: SuppressionPutInput): Promise<void> {
	if (!TABLE) {
		throw new Error('DYNAMODB_TABLE env var is not set');
	}
	await ddbClient.send(
		new PutCommand({
			TableName: TABLE,
			Item: {
				pk: suppressionPk(input.email),
				sk: suppressionMetaSk(),
				email: input.email,
				reason: input.reason,
				bounceType: input.bounceType,
				bounceSubType: input.bounceSubType,
				complaintFeedbackType: input.complaintFeedbackType,
				timestamp: input.timestamp
			}
		})
	);
}

/**
 * Lambda エントリ。 SNS event の各 record を parse して suppression を put する。
 *
 * `put` を引数化することで test が DDB に依存せずに済む (ESM の vi.mock では同モジュール内
 * の readonly binding を差し替えにくいため、 明示 DI を採用)。 Lambda runtime からは
 * 引数なしで呼ばれ、 default の `putSuppression` (DDB 実書き込み) が使われる。
 */
export async function handler(
	event: SnsEvent,
	deps: { put?: (input: SuppressionPutInput) => Promise<void> } = {}
): Promise<void> {
	const put = deps.put ?? putSuppression;
	for (const record of event.Records) {
		let notification: SesNotification;
		try {
			notification = JSON.parse(record.Sns.Message) as SesNotification;
		} catch (e) {
			console.error('Failed to parse SNS message as SES notification:', e);
			continue;
		}
		const items = selectSuppressionsFromNotification(notification);
		for (const item of items) {
			await put(item);
		}
	}
}
