/**
 * #139: server → client の wire format。
 *
 * server (form action / API endpoint) は **i18n 済文字列を返さない**。
 * 代わりに `{ code, field, max? }` の machine-readable な error を返し、
 * client が `t(\`errors.${code}\`, { field: t(\`fields.${field}\`), max })` で翻訳する。
 *
 * - `code`: i18n key (errors.json の key と一致、 例: 'required', 'invalidDateFormat')
 * - `field`: 該当フォーム field 名 (fields.json の key、 例: 'name', 'startDate')。
 *           field 名が翻訳に必要ない error (例: invalidColorFormat — color 固定) でも
 *           送る側のロジックを単純化するため必須。
 * - `max?`: tooLong の場合の上限文字数。
 */
import type { z } from 'zod';
import { t } from '$lib/i18n/index.svelte';

export type ServerError = {
	code: string;
	field: string;
	max?: number;
};

export type ServerErrors = Record<string, ServerError>;

/**
 * zod の SafeParseError から ServerErrors に変換する。
 * 同じ field 名で複数 issue がある場合は最初の 1 件のみ採用 (UX: 1 field に 1 エラー)。
 */
export function formatZodErrors<T>(result: z.ZodSafeParseError<T>): ServerErrors {
	const errors: ServerErrors = {};
	for (const issue of result.error.issues) {
		const field = issue.path.join('.');
		if (!field || errors[field]) continue;
		const err: ServerError = { code: issue.message, field };
		// zod の too_big issue は `maximum` を持つ。 tooLong の表示で必要。
		if (issue.code === 'too_big' && typeof (issue as { maximum?: unknown }).maximum === 'number') {
			err.max = (issue as { maximum: number }).maximum;
		}
		errors[field] = err;
	}
	return errors;
}

/**
 * Client 側で `ServerError` を表示文字列に翻訳する。 `null` / `undefined` の場合は空文字。
 * `t()` で取れなかった場合 (key 欠落) は `errors.generic` に fallback。
 */
export function translateServerError(err: ServerError | null | undefined): string {
	if (!err) return '';
	const field = t(`fields.${err.field}`);
	const params: Record<string, string | number> = { field };
	if (err.max !== undefined) params.max = err.max;
	const translated = t(`errors.${err.code}`, params);
	// `t()` は key 不在のとき key そのものを返す (i18n/index.svelte 実装)。
	// その場合は errors.generic に落とす。
	if (translated === `errors.${err.code}`) return t('errors.generic');
	return translated;
}
