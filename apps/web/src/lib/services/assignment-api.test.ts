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
	expectedVersion: 2,
	resourceId: 'r1',
	projectId: 'p1',
	startDate: '2026-05-03',
	endDateExclusive: '2026-05-10'
};

describe('patchAssignment (#180 / ADR 0012)', () => {
	it('sends PATCH /api/assignments/{id} with JSON body, returns { ok: true, version } on 200', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => ({ success: true, version: 3 })
		} as unknown as Response);

		const result = await patchAssignment('asn-1', PAYLOAD);

		expect(result).toEqual({ ok: true, version: 3 });
		expect(fetchMock).toHaveBeenCalledWith('/api/assignments/asn-1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(PAYLOAD),
			signal: expect.any(AbortSignal)
		});
	});

	it('returns { ok: false, conflict: true, latest } on 409 version conflict (ADR 0012)', async () => {
		const latest = {
			id: 'asn-1',
			resourceId: 'r1',
			projectId: 'p2',
			startDate: '2026-05-05',
			endDateExclusive: '2026-05-12',
			version: 4
		};
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 409,
			json: async () => ({ conflict: true, latest })
		} as unknown as Response);

		const result = await patchAssignment('asn-1', PAYLOAD);
		expect(result).toEqual({ ok: false, conflict: true, latest });
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

/**
 * #231 (cancel-latest / 単一フライト): 連続ドラッグで同一 assignment への PATCH が重なると、
 * 旧設計では server 側 conditional write が競合してエラーになる。 client 側で id 単位に
 * 前の in-flight を AbortController で abort し、 最新リクエストだけを有効化する。
 * abort された旧リクエストは「supersede された」結果 (`{ ok: false, superseded: true }`)
 * として返し、 呼び出し側 (handleUpdate) が revert / error toast の対象にしないようにする。
 */
describe('patchAssignment cancel-latest (#231)', () => {
	it('aborts the previous in-flight request for the same id; old call resolves to superseded', async () => {
		fetchMock
			.mockImplementationOnce(
				(_url: string, opts: { signal: AbortSignal }) =>
					new Promise((_resolve, reject) => {
						opts.signal.addEventListener('abort', () =>
							reject(new DOMException('aborted', 'AbortError'))
						);
					})
			)
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ success: true, version: 2 })
			} as unknown as Response);

		const p1 = patchAssignment('asn-1', PAYLOAD);
		const r2 = await patchAssignment('asn-1', PAYLOAD);
		const r1 = await p1;

		expect(r1).toEqual({ ok: false, superseded: true });
		expect(r2).toEqual({ ok: true, version: 2 });
	});

	it('does not abort an in-flight request for a different id', async () => {
		let signalA: AbortSignal | undefined;
		fetchMock
			.mockImplementationOnce((_url: string, opts: { signal: AbortSignal }) => {
				signalA = opts.signal;
				return new Promise<Response>(() => {});
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ success: true })
			} as unknown as Response);

		void patchAssignment('asn-A', PAYLOAD);
		await patchAssignment('asn-B', PAYLOAD);

		expect(signalA?.aborted).toBe(false);
	});
});
