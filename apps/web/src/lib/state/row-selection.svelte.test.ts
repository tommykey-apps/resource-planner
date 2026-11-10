// @vitest-environment jsdom
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { createRowSelection } from './row-selection.svelte';

/**
 * 表の行選択 (一括操作用)。
 * - 全選択の対象は表示中の行だけ (見えていない行を一括操作に巻き込まない)
 * - 全選択の見出しチェックボックスは 3 状態 (未選択 / 一部 = indeterminate / 全部)
 *   (デジタル庁「テーブル」/ Carbon Data table)
 * - 絞り込み・並び替え・ページが変わったら選択を解除する
 */
function setup(initialVisible: string[]) {
	let visible = $state(initialVisible);
	let key = $state('');
	let selection!: ReturnType<typeof createRowSelection>;
	const cleanup = $effect.root(() => {
		selection = createRowSelection(
			() => visible,
			() => key
		);
	});
	flushSync();
	return {
		get selection() {
			return selection;
		},
		setVisible(v: string[]) {
			visible = v;
			flushSync();
		},
		setKey(k: string) {
			key = k;
			flushSync();
		},
		cleanup
	};
}

describe('createRowSelection', () => {
	it('行を選ぶと件数と状態が変わる', () => {
		const t = setup(['a', 'b', 'c']);
		expect(t.selection.state).toBe('none');
		t.selection.toggle('a');
		expect(t.selection.isSelected('a')).toBe(true);
		expect(t.selection.ids).toEqual(['a']);
		expect(t.selection.state).toBe('some');
		t.cleanup();
	});

	it('toggleAll は一部選択中なら全部を選び、 全部選択中なら全部外す', () => {
		const t = setup(['a', 'b']);
		t.selection.toggle('a');
		t.selection.toggleAll();
		expect(t.selection.ids).toEqual(['a', 'b']);
		expect(t.selection.state).toBe('all');
		t.selection.toggleAll();
		expect(t.selection.ids).toEqual([]);
		t.cleanup();
	});

	it('表示されていない行は ids に含めない', () => {
		const t = setup(['a', 'b']);
		t.selection.toggleAll();
		t.setVisible(['b', 'c']);
		expect(t.selection.ids).toEqual(['b']);
		t.cleanup();
	});

	it('絞り込みなどの key が変わったら選択を解除する', () => {
		const t = setup(['a', 'b']);
		t.selection.toggle('a');
		t.setKey('?q=x');
		expect(t.selection.ids).toEqual([]);
		t.cleanup();
	});

	it('clear で全部外す', () => {
		const t = setup(['a']);
		t.selection.toggle('a');
		t.selection.clear();
		expect(t.selection.state).toBe('none');
		t.cleanup();
	});
});
