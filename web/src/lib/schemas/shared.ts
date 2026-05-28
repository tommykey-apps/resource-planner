import { z } from 'zod';

/**
 * #139: schema 内の `message` は **i18n code** に統一する (`errors.required` 等)。
 * UI 側で `t(\`errors.${msg}\`)` で翻訳することで、 サーバから locale 済文字列を返さない契約。
 *
 * code 体系:
 *   required           — 必須欠落 (min(1) など)
 *   tooLong            — 長さ超過 (max())
 *   tooMany            — 件数超過 (max(N) on array, #187)
 *   invalidDateFormat  — 日付 YYYY-MM-DD パターン不一致
 *   invalidColorFormat — #RRGGBB パターン不一致
 *   invalidUrl         — URL が http(s) でない / 形式不正 (#187)
 *   endBeforeStart     — 終了日 < 開始日 (refine)
 */

export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalidDateFormat');

export const colorString = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'invalidColorFormat');

// ── Delete-by-id (#171) ─────────────────────────────────────────────
// resource / project の delete form は hidden id のみ submit する。 +page.server.ts の
// makeFormAction helper で wire format を統一するため zod schema として定義。
//
// 旧手書きコードは `typeof id !== 'string' || !id` で missing と empty を同じ 'required'
// 扱いにしていた。 Zod v4 default の invalid_type message は missing → "expected string,
// received undefined" になるため、 `z.string({ error: 'required' })` で missing も 'required'
// に揃える (.min(1, 'required') で empty 検出と二重カバー)。
export const deleteByIdSchema = z.object({
	id: z.string({ error: 'required' }).min(1, 'required')
});
