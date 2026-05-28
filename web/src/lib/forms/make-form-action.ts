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
import { fail, type RequestEvent } from '@sveltejs/kit';
import type { z } from 'zod';
import { requireSession, type AppSession } from '$lib/session';
import { formatZodErrors } from './server-error';

type FormActionResult = Record<string, unknown> | void;

export function makeFormAction<S extends z.ZodType>(opts: {
	/** wire format の `action` field に載せる識別子 (debug / consumer 側 disambiguation 用)。 */
	action: string;
	/** formData を `Object.fromEntries` した object をそのまま `safeParse` する schema。 */
	schema: S;
	/**
	 * schema 通過後の業務処理。 戻り値の object は success payload に spread される
	 * (e.g. `{ resource }` を返すと client は `result.data.resource` で取れる)。
	 */
	run: (session: AppSession, parsed: z.infer<S>) => Promise<FormActionResult>;
}) {
	return async (event: RequestEvent) => {
		const session = await requireSession(event);
		const formData = await event.request.formData();
		// Object.fromEntries は同名 key の最後の値だけ拾うが、 本 form 群に repeated key は
		// 無いので問題ない (linksJson 等は JSON.stringify 済 single value)。
		const input = Object.fromEntries(formData);
		const parsed = opts.schema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { action: opts.action, errors: formatZodErrors(parsed) });
		}
		const extra = await opts.run(session, parsed.data);
		return { action: opts.action, success: true, ...(extra ?? {}) };
	};
}
