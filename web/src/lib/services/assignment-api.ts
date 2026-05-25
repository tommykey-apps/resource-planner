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

export interface PatchAssignmentPayload {
	prevStartDate: string;
	resourceId: string;
	projectId: string;
	startDate: string;
	endDateExclusive: string;
}

export type PatchAssignmentResult =
	| { ok: true }
	| { ok: false; errors: ServerErrors | null; status: number };

export async function patchAssignment(
	id: string,
	payload: PatchAssignmentPayload
): Promise<PatchAssignmentResult> {
	const res = await fetch(`/api/assignments/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	if (res.ok) return { ok: true };

	const data: unknown = await res.json().catch(() => null);
	const errors =
		data && typeof data === 'object' && 'errors' in data
			? ((data as { errors: ServerErrors }).errors ?? null)
			: null;
	return { ok: false, errors, status: res.status };
}
