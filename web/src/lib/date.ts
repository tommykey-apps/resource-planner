import type { DateString } from './types';

/**
 * 純粋な日付ユーティリティ。
 *
 * resource-planner は **DATE-only floating** (TZ なし `YYYY-MM-DD` 文字列) で日付を扱う
 * (iCalendar `VALUE=DATE` / Google Calendar 終日イベント相当)。Asia/Tokyo の暦日として
 * 解釈する前提。`Date.toISOString().slice(0, 10)` は UTC ベースで JST と日付がずれる
 * ことがあるため、フォーマッタは自前実装。
 */

/** YYYY-MM-DD (Asia/Tokyo) から、その日の 0:00 ローカルを表す Date を作る。 */
export function parseLocalDate(s: DateString): Date {
	const [y, m, d] = s.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/** Date を Asia/Tokyo の YYYY-MM-DD に変換する。 */
export function formatLocalDate(d: Date): DateString {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/**
 * YYYY-MM-DD 文字列に n 日加算 (n は負も可)。月跨ぎ・年跨ぎ・うるう年は
 * `Date.setDate(getDate() + n)` の自動正規化に任せる。
 *
 * 主要用途は `assignmentCreateSchema` の `.transform()` での inclusive → exclusive 変換
 * (`addDays(input.endDate, 1)`)。
 */
export function addDays(s: DateString, n: number): DateString {
	const d = parseLocalDate(s);
	d.setDate(d.getDate() + n);
	return formatLocalDate(d);
}
