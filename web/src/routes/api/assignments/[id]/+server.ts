import { json } from '@sveltejs/kit';
import { assignmentApiUpdateSchema } from '$lib/schemas';
import { updateAssignment } from '$lib/repository';
import { requireSession } from '$lib/auth';
import { formatZodErrors, type ServerErrors } from '$lib/forms/server-error';
import type { RequestHandler } from './$types';

/**
 * PATCH /api/assignments/[id] — Assignment の更新 (主にドラッグ移動 / リサイズ用、UC-04)。
 *
 * Form action ではなく `+server.ts` を使う理由 (ADR 0005):
 * - drag/resize は画面遷移を伴わない細粒度操作。fetch + JSON が自然
 * - ResourceTimeline の onMove / onResize callback から直接呼ぶ
 * - optimistic UI + 失敗時 revert を client side で完結させる
 *
 * 認証: session (lib/auth.ts) でテナント isolation。
 *
 * CSRF 保護 (#169): SvelteKit 組込みの origin check (`csrf.checkOrigin`) は
 * `application/x-www-form-urlencoded` / `multipart/form-data` / `text/plain` のみが対象で、
 * 本 endpoint の `application/json` PATCH は **対象外**。 実質防御は SameSite=Lax cookie の
 * default 挙動 (cross-origin から credentials 付き JSON が飛ばない) + CORS preflight に依存。
 * 厳密な CSRF が必要なら X-Requested-With header 必須化や独自 token を検討する。
 * 参考: https://svelte.dev/docs/kit/configuration#csrf
 *
 * Validation error wire format (#179): SvelteKit 公式は API endpoint で validation error を
 * `json({ errors }, { status: 400 })` で返すパターンを推奨 (https://svelte.dev/docs/kit/routing)。
 * `error()` は HTML page error flow 用なので、 form action と同じ `ServerErrors` wire format
 * (= `Record<field, { code, field, max? }>`) で返して client が `translateServerError` で
 * 翻訳できる契約に統一する。
 *
 * 楽観ロックは未実装 (last-write-wins)。同時編集が問題になったら version 列導入を別 ADR で検討。
 */
export const PATCH: RequestHandler = async (event) => {
	const session = await requireSession(event);
	const id = event.params.id;
	if (!id) {
		return jsonErrors({ id: { code: 'required', field: 'id' } }, 400);
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return jsonErrors({ body: { code: 'invalidJson', field: 'body' } }, 400);
	}

	const parsed = assignmentApiUpdateSchema.safeParse(body);
	if (!parsed.success) {
		return jsonErrors(formatZodErrors(parsed), 400);
	}

	await updateAssignment(session.teamId, parsed.data.prevStartDate, {
		id,
		resourceId: parsed.data.resourceId,
		projectId: parsed.data.projectId,
		startDate: parsed.data.startDate,
		endDateExclusive: parsed.data.endDateExclusive
	});

	return json({ success: true });
};

function jsonErrors(errors: ServerErrors, status: number): Response {
	return json({ errors }, { status });
}
