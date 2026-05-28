/**
 * #180: Assignment API (drag/resize 由来の PATCH) 用 service layer。
 *
 * 旧実装 (`+page.svelte` の `handleUpdate` 内に fetch 直書き) は:
 * - error handling が画面 component に張り付く
 * - 「optimistic + retry / dedup / cancel-on-unmount」 等将来要件で関数が膨らみやすい
 * という問題があったため、 fetch + wire format 解析を本 service に集約。 component は
 * 「成功 / 失敗 + 翻訳可能 errors」 という結果型だけ受け取る。
 *
 * Wire format は #179 で API endpoint と form action を統一した `ServerErrors`
 * (= `Record<field, { code, field, max? }>`)。
 */
import type { ServerErrors } from '$lib/forms/server-error';
import type { Assignment } from '$lib/types';

export interface PatchAssignmentPayload {
	/** 楽観ロック用 (ADR 0012): client が read した version。 不一致なら 409。 */
	expectedVersion: number;
	resourceId: string;
	projectId: string;
	startDate: string;
	endDateExclusive: string;
}

export type PatchAssignmentResult =
	| { ok: true; version: number }
	| { ok: false; superseded: true }
	| { ok: false; conflict: true; latest: Assignment | null }
	| { ok: false; errors: ServerErrors | null; status: number };

/**
 * #231 (cancel-latest / 単一フライト): assignment id 単位で進行中の PATCH を 1 本に絞る。
 * drag/resize を連続操作すると PATCH が重なり、 server 側 conditional write が競合して
 * エラーになるため、 新しい PATCH を出す前に同一 id の前 request を abort する。
 */
const inFlight = new Map<string, AbortController>();

/** AbortController.abort() 由来の reject か判定 (DOMException / Error 両対応で instanceof は使わない)。 */
function isAbortError(e: unknown): boolean {
	return (
		typeof e === 'object' &&
		e !== null &&
		'name' in e &&
		(e as { name: unknown }).name === 'AbortError'
	);
}

export async function patchAssignment(
	id: string,
	payload: PatchAssignmentPayload
): Promise<PatchAssignmentResult> {
	// 同一 id の前 request を abort してから新 controller を登録する。
	inFlight.get(id)?.abort();
	const controller = new AbortController();
	inFlight.set(id, controller);

	try {
		const res = await fetch(`/api/assignments/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
			signal: controller.signal
		});
		if (res.ok) {
			const data: unknown = await res.json().catch(() => null);
			const version =
				data && typeof data === 'object' && 'version' in data
					? (data as { version: number }).version
					: NaN;
			return { ok: true, version };
		}

		const data: unknown = await res.json().catch(() => null);
		// 409: 楽観ロック競合 (ADR 0012)。 最新 item を返して呼び出し側が rebase + 通知する。
		if (res.status === 409) {
			const latest =
				data && typeof data === 'object' && 'latest' in data
					? (data as { latest: Assignment | null }).latest
					: null;
			return { ok: false, conflict: true, latest };
		}
		const errors =
			data && typeof data === 'object' && 'errors' in data
				? ((data as { errors: ServerErrors }).errors ?? null)
				: null;
		return { ok: false, errors, status: res.status };
	} catch (e) {
		// 後続 request に supersede された (= 自分が abort された) 場合は呼び出し側で
		// revert / toast の対象にしない。 それ以外の network error は従来通り throw。
		if (isAbortError(e)) return { ok: false, superseded: true };
		throw e;
	} finally {
		// 自分が最新 controller のままなら掃除する (後続が set 済みなら触らない)。
		if (inFlight.get(id) === controller) inFlight.delete(id);
	}
}
