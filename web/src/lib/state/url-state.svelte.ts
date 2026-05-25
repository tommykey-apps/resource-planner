/**
 * #174: URL ↔ state 双方向同期の $effect 重複を 1 helper に集約。
 *
 * 旧 (+page.svelte / assignments/+page.svelte で同形 ~7 行ずつ):
 * ```ts
 * $effect(() => {
 *   if (typeof window === 'undefined') return;
 *   const next = applyXxxParams(new URL(window.location.href), state);
 *   if (next.toString() !== window.location.href) {
 *     goto(next, { replaceState: true, noScroll: true, keepFocus: true });
 *   }
 * });
 * ```
 *
 * 設計判断:
 * - **state 自体は consumer 側に残す** (Svelte 5 `bind:` で field 単位の双方向 binding を維持
 *   するため、 helper が state を所有して getter/setter 化すると bind: の使い勝手が悪化する)
 * - **helper は $effect 起動のみ** を担う (`syncStateToUrl(getState, apply)`)
 * - `.svelte.ts` 拡張子で runes 利用可 (Svelte 5 公式)
 *
 * 公式 docs 参照:
 * - https://svelte.dev/docs/svelte/svelte-js-files (`.svelte.ts` の runes サポート)
 * - https://svelte.dev/docs/kit/state-management (URL を state の置き場として推奨)
 */
import { goto } from '$app/navigation';

export function syncStateToUrl<T>(
	getState: () => T,
	apply: (url: URL, state: T) => URL
): void {
	$effect(() => {
		if (typeof window === 'undefined') return;
		const next = apply(new URL(window.location.href), getState());
		if (next.toString() !== window.location.href) {
			goto(next, { replaceState: true, noScroll: true, keepFocus: true });
		}
	});
}
