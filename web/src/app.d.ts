import type { Locale } from '$lib/i18n/index.svelte';
import type { Theme } from '$lib/theme';

declare global {
	namespace App {
		/**
		 * #178: error() の body に machine-readable な i18n key を載せて、
		 * +error.svelte が user locale で翻訳できる構造にする (SvelteKit 公式パターン)。
		 * - message: locale 未知時の fallback (英語 hardcode で OK)
		 * - code: errors.json の key (例: 'authRequired')。 client が `t(\`errors.${code}\`)` 化
		 *
		 * 参考: https://svelte.dev/docs/kit/errors
		 *
		 * server-side で t() を呼ぶ案も検討したが、 localeState は \`$state\` の singleton で
		 * cross-request leak risk が SvelteKit 公式 docs で明示警告されている。
		 */
		interface Error {
			message: string;
			code?: string;
		}
		interface Locals {
			locale: Locale;
			theme: Theme;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
