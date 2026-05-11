import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * SES bounce / complaint handler の unit test (#134)。 putSuppression を mock して、
 * SES の公式 sample message を流したときに正しい引数で呼ばれることを assert する。
 *
 * SES の公式 sample: https://docs.aws.amazon.com/ses/latest/dg/notification-examples.html
 */

import {
	handler,
	selectSuppressionsFromNotification,
	type SesNotification,
	type SnsEvent
} from './ses-bounce-handler';

const putSuppressionMock = vi.fn();

const HARD_BOUNCE: SesNotification = {
	notificationType: 'Bounce',
	bounce: {
		bounceType: 'Permanent',
		bounceSubType: 'General',
		bouncedRecipients: [
			{ emailAddress: 'bounce@example.com', action: 'failed', status: '5.1.1' }
		],
		timestamp: '2026-05-12T10:00:00Z',
		feedbackId: 'fb-1'
	}
};

const SOFT_BOUNCE: SesNotification = {
	notificationType: 'Bounce',
	bounce: {
		bounceType: 'Transient',
		bouncedRecipients: [{ emailAddress: 'soft@example.com' }],
		timestamp: '2026-05-12T10:01:00Z'
	}
};

const COMPLAINT: SesNotification = {
	notificationType: 'Complaint',
	complaint: {
		complainedRecipients: [{ emailAddress: 'spammed@example.com' }],
		complaintFeedbackType: 'abuse',
		timestamp: '2026-05-12T10:02:00Z',
		feedbackId: 'fb-2'
	}
};

function wrapSns(notif: SesNotification): SnsEvent {
	return { Records: [{ Sns: { Message: JSON.stringify(notif) } }] };
}

beforeEach(() => putSuppressionMock.mockReset().mockResolvedValue(undefined));
afterEach(() => vi.restoreAllMocks());

describe('selectSuppressionsFromNotification (#134)', () => {
	it('hard bounce → 1 件返す (Permanent)', () => {
		const items = selectSuppressionsFromNotification(HARD_BOUNCE);
		expect(items).toEqual([
			{
				email: 'bounce@example.com',
				reason: 'bounce',
				bounceType: 'Permanent',
				bounceSubType: 'General',
				timestamp: '2026-05-12T10:00:00Z'
			}
		]);
	});

	it('soft bounce (Transient) → 0 件 (SES が自動 retry するので無視)', () => {
		expect(selectSuppressionsFromNotification(SOFT_BOUNCE)).toEqual([]);
	});

	it('complaint → 1 件返す (reason="complaint" + feedback type)', () => {
		expect(selectSuppressionsFromNotification(COMPLAINT)).toEqual([
			{
				email: 'spammed@example.com',
				reason: 'complaint',
				complaintFeedbackType: 'abuse',
				timestamp: '2026-05-12T10:02:00Z'
			}
		]);
	});

	it('複数 recipient の hard bounce → 全て返す', () => {
		const items = selectSuppressionsFromNotification({
			notificationType: 'Bounce',
			bounce: {
				bounceType: 'Permanent',
				bouncedRecipients: [
					{ emailAddress: 'a@example.com' },
					{ emailAddress: 'b@example.com' }
				],
				timestamp: '2026-05-12T10:00:00Z'
			}
		});
		expect(items).toHaveLength(2);
		expect(items.map((i) => i.email)).toEqual(['a@example.com', 'b@example.com']);
	});
});

describe('handler (Lambda entry)', () => {
	it('hard bounce notification → putSuppression(1 件) を呼ぶ', async () => {
		await handler(wrapSns(HARD_BOUNCE), { put: putSuppressionMock });
		expect(putSuppressionMock).toHaveBeenCalledTimes(1);
		expect(putSuppressionMock).toHaveBeenCalledWith(
			expect.objectContaining({
				email: 'bounce@example.com',
				reason: 'bounce',
				bounceType: 'Permanent'
			})
		);
	});

	it('soft bounce → putSuppression 呼ばれない', async () => {
		await handler(wrapSns(SOFT_BOUNCE), { put: putSuppressionMock });
		expect(putSuppressionMock).not.toHaveBeenCalled();
	});

	it('complaint → putSuppression(reason="complaint") を呼ぶ', async () => {
		await handler(wrapSns(COMPLAINT), { put: putSuppressionMock });
		expect(putSuppressionMock).toHaveBeenCalledTimes(1);
		expect(putSuppressionMock).toHaveBeenCalledWith(
			expect.objectContaining({
				email: 'spammed@example.com',
				reason: 'complaint',
				complaintFeedbackType: 'abuse'
			})
		);
	});

	it('SNS Records 複数 + 不正 JSON 混在 → 正常なものだけ処理', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const event: SnsEvent = {
			Records: [
				{ Sns: { Message: 'not json' } },
				{ Sns: { Message: JSON.stringify(HARD_BOUNCE) } },
				{ Sns: { Message: JSON.stringify(COMPLAINT) } }
			]
		};
		await handler(event, { put: putSuppressionMock });
		expect(putSuppressionMock).toHaveBeenCalledTimes(2);
		expect(consoleSpy).toHaveBeenCalled();
	});

	it('冪等性: 同じ event を 2 回 → putSuppression を 2 回呼ぶ (DDB Put は同 PK 上書きで safe)', async () => {
		await handler(wrapSns(HARD_BOUNCE), { put: putSuppressionMock });
		await handler(wrapSns(HARD_BOUNCE), { put: putSuppressionMock });
		expect(putSuppressionMock).toHaveBeenCalledTimes(2);
	});
});
