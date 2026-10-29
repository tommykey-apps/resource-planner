import { describe, expect, it } from 'vitest';
import { overwriteGetLocale } from '$lib/paraglide/runtime';
import { m } from '$lib/paraglide/messages.js';
import { errorMessage, fieldLabel, themeLabel } from './message-maps';

/**
 * Paraglide JS は実行時のキー文字列での検索を持たない。 server が返す code や
 * theme の値は、 対応表 (値 → メッセージ関数) を通して翻訳する。
 */
describe('errorMessage', () => {
	it('既知の code は field と max を補間して返す', () => {
		overwriteGetLocale(() => 'ja');
		expect(errorMessage('tooLong', { field: '名前', max: 100 })).toBe(
			'名前 は 100 文字以内で入力してください'
		);
	});

	it('未知の code は undefined (呼び出し側が fallback を決める)', () => {
		expect(errorMessage('noSuchCode', { field: 'x' })).toBeUndefined();
		// Object.prototype のキーも未知として扱う
		expect(errorMessage('toString', { field: 'x' })).toBeUndefined();
	});
});

describe('fieldLabel', () => {
	it('既知の field は表示名、 未知は field 名そのもの', () => {
		overwriteGetLocale(() => 'en');
		expect(fieldLabel('startDate')).toBe('Start date');
		expect(fieldLabel('unknownField')).toBe('unknownField');
	});
});

describe('themeLabel', () => {
	it('light / dark / system を現在の言語で返す', () => {
		overwriteGetLocale(() => 'ja');
		expect(themeLabel('dark')).toBe('ダーク');
		overwriteGetLocale(() => 'en');
		expect(themeLabel('system')).toBe('system');
	});
});

describe('英語の複数形 (CLDR の plural category)', () => {
	it('1 件は単数形、 それ以外は複数形', () => {
		overwriteGetLocale(() => 'en');
		expect(m.resources_bulkDeleted({ count: 1 })).toBe('Deleted 1 person');
		expect(m.resources_bulkDeleted({ count: 2 })).toBe('Deleted 2 people');
		expect(m.common_count({ count: 0 })).toBe('0 items');
		expect(m.projects_confirmBulkDeleteWithAssignments({ count: 1, assignments: 3 })).toBe(
			"Delete 1 selected project and 3 related assignments?\nThis can't be undone."
		);
	});

	it('日本語は数で形が変わらない', () => {
		overwriteGetLocale(() => 'ja');
		expect(m.resources_bulkDeleted({ count: 1 })).toBe('メンバー 1 名を削除しました');
		expect(m.resources_bulkDeleted({ count: 2 })).toBe('メンバー 2 名を削除しました');
	});
});
