import { describe, expect, it } from 'vitest';
import { buildSuppressionItem, type SuppressionInput } from './suppression-item';

/**
 * #181: putSuppression が 2 ファイル (repository / lambda) に複製されていたのを
 * pure な item builder に集約。 両 caller が同じ DDB item shape を吐くことを保証する。
 */
describe('buildSuppressionItem (#181)', () => {
	it('builds bounce item with pk lowercased + full fields', () => {
		const input: SuppressionInput = {
			email: 'Alice@Example.com',
			reason: 'bounce',
			bounceType: 'Permanent',
			bounceSubType: 'General',
			timestamp: '2026-05-12T00:00:00Z'
		};
		expect(buildSuppressionItem(input)).toEqual({
			pk: 'SUPPRESS#alice@example.com',
			sk: 'META',
			email: 'Alice@Example.com',
			reason: 'bounce',
			bounceType: 'Permanent',
			bounceSubType: 'General',
			complaintFeedbackType: undefined,
			timestamp: '2026-05-12T00:00:00Z'
		});
	});

	it('builds complaint item without bounceType / bounceSubType', () => {
		const input: SuppressionInput = {
			email: 'bob@example.com',
			reason: 'complaint',
			complaintFeedbackType: 'abuse',
			timestamp: '2026-05-13T01:00:00Z'
		};
		expect(buildSuppressionItem(input)).toEqual({
			pk: 'SUPPRESS#bob@example.com',
			sk: 'META',
			email: 'bob@example.com',
			reason: 'complaint',
			bounceType: undefined,
			bounceSubType: undefined,
			complaintFeedbackType: 'abuse',
			timestamp: '2026-05-13T01:00:00Z'
		});
	});

	it('preserves original-case email in attribute while lowering pk', () => {
		const item = buildSuppressionItem({
			email: 'MixedCase@DOMAIN.com',
			reason: 'bounce',
			bounceType: 'Permanent',
			timestamp: '2026-05-14T00:00:00Z'
		});
		expect(item.pk).toBe('SUPPRESS#mixedcase@domain.com');
		expect(item.email).toBe('MixedCase@DOMAIN.com');
	});
});
