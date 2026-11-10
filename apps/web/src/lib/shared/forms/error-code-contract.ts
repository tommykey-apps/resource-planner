/**
 * schema の `message` に使ってよい i18n code の一覧と、テストで message を取り出す補助 (#139)。
 * UI は `errorMessage(code)` で文言に変えるので、ここにない code や日本語を直接書くと表示が崩れる。
 * 各 feature の `schema.test.ts` から使う。
 */
export const ERROR_CODES = new Set([
	'required',
	'tooLong',
	'tooMany',
	'invalidDateFormat',
	'invalidColorFormat',
	'invalidUrl',
	'invalidVersion',
	'invalidEmail',
	'endBeforeStart'
]);

export function collectMessages(
	schema: {
		safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } };
	},
	input: unknown
): string[] {
	const r = schema.safeParse(input);
	if (r.success || !r.error) return [];
	return r.error.issues.map((i) => i.message);
}
