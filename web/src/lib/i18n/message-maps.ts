/**
 * 実行時の値 (server が返す error code / field 名、 theme) から文言を引く対応表。
 *
 * Paraglide JS はキー文字列での動的検索を持たず、 公式は「値 → メッセージ関数」の
 * 明示的な対応表を推奨している (https://paraglidejs.com/message-keys)。
 * 対応表にしておくと未使用メッセージの検出も効く。
 */
import { m } from '$lib/paraglide/messages.js';
import type { Theme } from '$lib/theme';

type ErrorParams = { field: string; max?: number };

const errorMessages = new Map<string, (p: ErrorParams) => string>(
	Object.entries({
		generic: () => m.errors_generic(),
		required: (p: ErrorParams) => m.errors_required(p),
		tooLong: (p: ErrorParams) => m.errors_tooLong({ field: p.field, max: p.max ?? '' }),
		invalidDateFormat: (p: ErrorParams) => m.errors_invalidDateFormat(p),
		invalidColorFormat: () => m.errors_invalidColorFormat(),
		endBeforeStart: () => m.errors_endBeforeStart(),
		invalidVersion: () => m.errors_invalidVersion(),
		tooMany: (p: ErrorParams) => m.errors_tooMany({ field: p.field, max: p.max ?? '' }),
		invalidUrl: (p: ErrorParams) => m.errors_invalidUrl(p),
		nameConflict: () => m.errors_nameConflict(),
		parentNotFound: () => m.errors_parentNotFound(),
		cycle: () => m.errors_cycle(),
		notFound: () => m.errors_notFound(),
		authRequired: () => m.errors_authRequired()
	})
);

const fieldLabels = new Map<string, () => string>(
	Object.entries({
		id: m.fields_id,
		name: m.fields_name,
		color: m.fields_color,
		startDate: m.fields_startDate,
		endDate: m.fields_endDate,
		resourceId: m.fields_resourceId,
		projectId: m.fields_projectId
	})
);

const themeLabels: Record<Theme, () => string> = {
	light: m.theme_light,
	dark: m.theme_dark,
	system: m.theme_system
};

/** 未知の code は undefined。 fallback は呼び出し側が決める。 */
export function errorMessage(code: string, params: ErrorParams): string | undefined {
	return errorMessages.get(code)?.(params);
}

/** 未知の field は field 名をそのまま返す。 */
export function fieldLabel(field: string): string {
	return fieldLabels.get(field)?.() ?? field;
}

export function themeLabel(theme: Theme): string {
	return themeLabels[theme]();
}
