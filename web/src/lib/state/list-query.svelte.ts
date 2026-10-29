/**
 * 一覧の表 (メンバー / 案件) の状態を URL query と結ぶ。
 *
 * 状態は URL にだけ持ち、 `$state` に複製しない (SvelteKit 公式 state-management:
 * https://svelte.dev/docs/kit/state-management#Storing-state-in-the-URL)。
 * 複製すると、 ページ送りの <a> で URL が変わったときに状態とずれる。
 *
 * - 絞り込み・並び替え: `update()` が `goto(..., { replaceState })` で URL を書き換える
 *   (入力のたびに履歴を積まない。 timeline / assignments の syncStateToUrl と同じ方針)
 * - ページ送り: `hrefFor()` の URL を <a> に渡す (デジタル庁「ページナビゲーション」: URL が変わるなら <a>)
 * - 画面固有の絞り込み (メンバーの部署など) は `filterKeys` で受け、 空文字なら URL から消す
 */
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { applyListQuery, parseListQuery, type ListQuery } from '$lib/list-table';

export function createListQuery<K extends string, F extends string = never>(
	sortKeys: readonly K[],
	defaults: ListQuery<K>,
	filterKeys: readonly F[] = []
) {
	const current = $derived(parseListQuery(page.url.searchParams, sortKeys, defaults));

	function toHref(next: ListQuery<K>, filters: Partial<Record<F, string>> = {}): string {
		const url = applyListQuery(page.url, next, defaults);
		for (const key of filterKeys) {
			if (!(key in filters)) continue;
			const v = filters[key];
			if (v) url.searchParams.set(key, v);
			else url.searchParams.delete(key);
		}
		return url.pathname + url.search;
	}

	function navigate(href: string) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- クエリ文字列付きの URL は resolve() で表せずルールが未対応のため除外
		goto(href, { replaceState: true, keepFocus: true, noScroll: true });
	}

	return {
		get current() {
			return current;
		},
		update(patch: Partial<ListQuery<K>>) {
			navigate(toHref({ ...current, ...patch }));
		},
		filter(key: F): string {
			return page.url.searchParams.get(key) ?? '';
		},
		/** 絞り込みを変えたら結果の件数が変わるので 1 ページ目に戻す。 */
		setFilter(key: F, value: string) {
			navigate(toHref({ ...current, page: 1 }, { [key]: value } as Partial<Record<F, string>>));
		},
		clearFilters() {
			const cleared = Object.fromEntries(filterKeys.map((k) => [k, ''])) as Record<F, string>;
			navigate(toHref({ ...current, q: defaults.q, page: 1 }, cleared));
		},
		hrefFor(pageNumber: number) {
			return toHref({ ...current, page: pageNumber });
		}
	};
}
