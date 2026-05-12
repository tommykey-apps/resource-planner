/**
 * i18n core (#98)。burnnote から移植 + SSR cookie / Accept-Language 対応。
 *
 * - locale state を `$state` で reactive に保持
 * - `t('key.subkey', { name })` で文字列取得 + `{name}` プレースホルダ補間
 * - SSR は `+layout.server.ts` の load で cookie / Accept-Language から locale 決定し
 *   `data.locale` で渡す → `+layout.svelte` で `localeState.set(...)` 同期
 * - client は localStorage > navigator.language の優先順で初期化 (SSR 経由でも cookie から復元)
 */
import en from './en.json';
import ja from './ja.json';

export type Locale = 'en' | 'ja';

const messages = { en, ja } as const;

const STORAGE_KEY = 'resource-planner-locale';
export const COOKIE_NAME = 'resource-planner-locale';

type MessageNode = string | { [k: string]: MessageNode };

class LocaleState {
	current = $state<Locale>('ja');

	set(next: Locale): void {
		this.current = next;
		if (typeof window !== 'undefined') {
			try {
				localStorage.setItem(STORAGE_KEY, next);
				document.cookie = `${COOKIE_NAME}=${next}; path=/; max-age=31536000; samesite=lax`;
			} catch {
				// ignore storage errors
			}
			document.documentElement.lang = next;
		}
	}

	/**
	 * Client-side initialization。SSR で cookie 経由で渡された locale が優先、
	 * cookie 無い場合は localStorage > navigator.language。
	 */
	init(serverLocale?: Locale | null): void {
		if (serverLocale === 'en' || serverLocale === 'ja') {
			this.current = serverLocale;
			if (typeof document !== 'undefined') {
				document.documentElement.lang = serverLocale;
			}
			return;
		}
		if (typeof window === 'undefined') return;
		let stored: string | null = null;
		try {
			stored = localStorage.getItem(STORAGE_KEY);
		} catch {
			// ignore
		}
		if (stored === 'en' || stored === 'ja') {
			this.set(stored);
			return;
		}
		const nav = navigator.language?.toLowerCase() ?? '';
		this.set(nav.startsWith('ja') ? 'ja' : 'en');
	}
}

export const localeState = new LocaleState();

export function initLocale(serverLocale?: Locale | null): void {
	localeState.init(serverLocale);
}

/**
 * `Accept-Language` header から ja/en を抽出 (server-side、純粋関数なのでテスト容易)。
 * 例: `ja,en-US;q=0.9` → 'ja'、`en-US,en;q=0.9` → 'en'、不明 → 'en' (default)。
 */
export function pickLocaleFromAcceptLanguage(header: string | null | undefined): Locale {
	if (!header) return 'en';
	const lower = header.toLowerCase();
	// 各 candidate を q 値で並べてもいいが、社内利用 (ja/en の 2 言語のみ) なので最初に
	// マッチした方を採用。`ja` が含まれていれば ja を優先 (社内ユーザー主体想定)。
	for (const part of lower.split(',')) {
		const lang = part.trim().split(';')[0];
		if (lang.startsWith('ja')) return 'ja';
		if (lang.startsWith('en')) return 'en';
	}
	return 'en';
}

export function t(key: string, params?: Record<string, string | number>): string {
	const parts = key.split('.');
	let node: MessageNode = messages[localeState.current];
	for (const p of parts) {
		if (typeof node === 'string') return key;
		node = node[p];
		if (node === undefined) return key;
	}
	if (typeof node !== 'string') return key;
	if (!params) return node;
	return node.replace(/\{(\w+)\}/g, (_, k) => {
		const v = params[k];
		return v === undefined ? `{${k}}` : String(v);
	});
}
