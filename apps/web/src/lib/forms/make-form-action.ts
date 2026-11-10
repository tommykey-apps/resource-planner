/**
 * #171: SvelteKit form action のボイラープレートを集約する factory。
 *
 * +page.server.ts の 9 form action は全部同形だった:
 *   requireSession → formData → safeParse → fail(400) or run → return { action, success: true, ...extra? }
 *
 * delete 系の `typeof id !== 'string'` 手書きチェックも zod schema (`z.object({ id: z.string().min(1) })`) に
 * 移植することで wire format (ServerErrors) を統一できる (#179 と整合)。
 *
 * 戻り値の payload shape は既存挙動と互換 (consumer 側 ResourceManager / ProjectManager 等が
 * `result.data.errors` を参照する pattern、 `action` field は debug 用に保持)。
 *
 * **server-side 限定**: SvelteKit `fail` / `Actions` 型を使うため +page.server.ts からのみ
 * import すること (client bundle に入ると build エラー)。
 */
import { fail, isActionFailure, type ActionFailure, type RequestEvent } from '@sveltejs/kit';
import type { z } from 'zod';
import { requireSession, type AppSession } from '$lib/session';
import { formatZodErrors } from './server-error';

type FormActionExtra = Record<string, unknown> | void;
type FormActionResult = FormActionExtra | ActionFailure<Record<string, unknown>>;

/** SvelteKit の isActionFailure は ActionFailure<undefined> に絞るので、 run の戻り値の型で絞り直す。 */
function isFailure(r: FormActionResult): r is ActionFailure<Record<string, unknown>> {
	return isActionFailure(r);
}

export function makeFormAction<S extends z.ZodType>(opts: {
	/** wire format の `action` field に載せる識別子 (debug / consumer 側 disambiguation 用)。 */
	action: string;
	/** formData を `Object.fromEntries` した object をそのまま `safeParse` する schema。 */
	schema: S;
	/**
	 * formData を schema に渡す object に変える。 既定は `Object.fromEntries` (同名 key は最後の値だけ)。
	 * 一括操作の `ids` のように同じ key を繰り返す form は `formData.getAll()` で読む。
	 */
	readInput?: (formData: FormData) => Record<string, unknown>;
	/**
	 * schema 通過後の業務処理。 戻り値の object は success payload に spread される
	 * (e.g. `{ resource }` を返すと client は `result.data.resource` で取れる)。
	 * `fail()` を返したら (一括削除の一部失敗など) そのまま返す。
	 */
	run: (session: AppSession, parsed: z.infer<S>) => Promise<FormActionResult>;
}) {
	return async (
		event: RequestEvent
	): Promise<ActionFailure<Record<string, unknown>> | Record<string, unknown>> => {
		const session = await requireSession(event);
		const formData = await event.request.formData();
		// Object.fromEntries は同名 key の最後の値だけ拾う。 repeated key を持つ form は readInput で読む。
		const input = opts.readInput ? opts.readInput(formData) : Object.fromEntries(formData);
		const parsed = opts.schema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { action: opts.action, errors: formatZodErrors(parsed) });
		}
		const extra = await opts.run(session, parsed.data);
		if (isFailure(extra)) return extra;
		return { action: opts.action, success: true, ...(extra as FormActionExtra) };
	};
}
