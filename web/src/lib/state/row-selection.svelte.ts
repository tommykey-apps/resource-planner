/**
 * 表の行選択 (一括操作用)。
 *
 * - 全選択の対象は表示中の行 (`getVisibleIds`) だけ。 選択済みでも表示されていない行は `ids` に含めない
 *   (見えていない行を一括削除などに巻き込まない)
 * - 見出しの全選択チェックボックスは 3 状態 `none` / `some` (indeterminate) / `all`
 *   (デジタル庁「テーブル」行の選択、 Carbon Data table batch actions)
 * - `getResetKey` (絞り込み・並び替え・ページを表す URL query) が変わったら選択を解除する
 *
 * 呼び出しはコンポーネント初期化中に行う ($effect を使うため)。
 */
import { SvelteSet } from 'svelte/reactivity';

export type SelectionState = 'none' | 'some' | 'all';

export function createRowSelection(getVisibleIds: () => string[], getResetKey: () => unknown) {
	const selected = new SvelteSet<string>();

	$effect(() => {
		getResetKey();
		selected.clear();
	});

	const ids = $derived(getVisibleIds().filter((id) => selected.has(id)));
	const state = $derived.by((): SelectionState => {
		if (ids.length === 0) return 'none';
		return ids.length === getVisibleIds().length ? 'all' : 'some';
	});

	return {
		get ids() {
			return ids;
		},
		get state() {
			return state;
		},
		isSelected(id: string) {
			return selected.has(id);
		},
		toggle(id: string) {
			if (selected.has(id)) selected.delete(id);
			else selected.add(id);
		},
		/** 一部 / 未選択なら表示中の行を全部選び、 全部選択中なら全部外す。 */
		toggleAll() {
			const selectAll = state !== 'all';
			selected.clear();
			if (selectAll) for (const id of getVisibleIds()) selected.add(id);
		},
		clear() {
			selected.clear();
		}
	};
}
