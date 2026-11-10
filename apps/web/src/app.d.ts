import type { Theme } from '$lib/theme';

declare global {
	namespace App {
		/**
		 * #178: error() の body に machine-readable な i18n key を載せて、
		 * +error.svelte が user locale で翻訳できる構造にする (SvelteKit 公式パターン)。
		 * - message: locale 未知時の fallback (英語 hardcode で OK)
		 * - code: error code (例: 'authRequired')。 client が `$lib/i18n/message-maps` で翻訳
		 *
		 * 参考: https://svelte.dev/docs/kit/errors
		 *
		 * server で翻訳しないのは、 文言を client の言語に揃えるため (wire format は code に限る)。
		 */
		interface Error {
			message: string;
			code?: string;
		}
		interface Locals {
			theme: Theme;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
