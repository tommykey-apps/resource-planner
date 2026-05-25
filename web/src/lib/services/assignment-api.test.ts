import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { patchAssignment } from './assignment-api';

/**
 * #180: drag/resize の PATCH を service module に切り出した薄い fetch wrapper。
 * - 成功時: { ok: true }
 * - 失敗時: server の ServerErrors (#179 wire format) を解析して { ok: false, errors, status }
 *   へ統一 (client UI の toast / inline error 表示で使う)
 */

const fetchMock = vi.fn();

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const PAYLOAD = {
	prevStartDate: '2026-05-01',
	resourceId: 'r1',
	projectId: 'p1',
	startDate: '2026-05-03',
	endDateExclusive: '2026-05-10'
};

describe('patchAssignment (#180)', () => {
	it('sends PATCH /api/assignments/{id} with JSON body, returns { ok: true } on 200', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => ({ success: true })
		} as unknown as Response);

		const result = await patchAssignment('asn-1', PAYLOAD);

		expect(result).toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledWith('/api/assignments/asn-1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(PAYLOAD)
		});
	});

	it('returns { ok: false, errors, status } when server returns 400 + ServerErrors', async () => {
		const errors = {
			endDateExclusive: { code: 'endBeforeStart', field: 'endDateExclusive' }
		};
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 400,
			json: async () => ({ errors })
		} as unknown as Response);

		const result = await patchAssignment('asn-1', PAYLOAD);
		expect(result).toEqual({ ok: false, errors, status: 400 });
	});

	it('returns { ok: false, errors: null, status } when server response is not parseable JSON', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: async () => {
				throw new SyntaxError('invalid JSON');
			}
		} as unknown as Response);

		const result = await patchAssignment('asn-1', PAYLOAD);
		expect(result).toEqual({ ok: false, errors: null, status: 500 });
	});

	it('returns { ok: false, errors: null, status } when server response lacks errors field', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 401,
			json: async () => ({ message: 'Authentication required', code: 'authRequired' })
		} as unknown as Response);

		const result = await patchAssignment('asn-1', PAYLOAD);
		expect(result).toEqual({ ok: false, errors: null, status: 401 });
	});
});
