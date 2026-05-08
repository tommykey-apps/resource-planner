import { error, json } from '@sveltejs/kit';
import { assignmentApiUpdateSchema } from '$lib/schemas';
import { updateAssignment } from '$lib/repository';
import type { RequestHandler } from './$types';

/**
 * PATCH /api/assignments/[id] — Assignment の更新 (主にドラッグ移動 / リサイズ用、UC-04)。
 *
 * Form action ではなく `+server.ts` を使う理由 (ADR 0005):
 * - drag/resize は画面遷移を伴わない細粒度操作。fetch + JSON が自然
 * - ResourceTimeline の onMove / onResize callback から直接呼ぶ
 * - optimistic UI + 失敗時 revert を client side で完結させる
 *
 * 認証: SvelteKit の origin チェック + Clerk session でテナント isolation。
 * 楽観ロックは未実装 (last-write-wins)。同時編集が問題になったら version 列導入を別 ADR で検討。
 */
export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	const auth = locals.auth();
	if (!auth.userId) error(401, '認証が必要です');
	if (!auth.orgId) error(403, '組織が選択されていません');

	const id = params.id;
	if (!id) error(400, 'id is required');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'invalid JSON');
	}

	const parsed = assignmentApiUpdateSchema.safeParse(body);
	if (!parsed.success) {
		error(400, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
	}

	await updateAssignment(auth.orgId, parsed.data.prevStartDate, {
		id,
		resourceId: parsed.data.resourceId,
		projectId: parsed.data.projectId,
		startDate: parsed.data.startDate,
		endDateExclusive: parsed.data.endDateExclusive
	});

	return json({ success: true });
};
