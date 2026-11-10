<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { SelectionState } from '$lib/state/row-selection.svelte';

	/**
	 * 全選択の見出しセル。 デジタル庁「テーブル」チェックボックスを持つテーブルのマークアップを移植:
	 * thead に置き、 名前「行を選択」 + 説明「すべての行を選択する」。 公式例の aria-description は
	 * WAI-ARIA 1.3 草案の属性なので、 確定済みの WAI-ARIA 1.2 にある aria-describedby で同じ説明を付ける
	 * (hidden の要素も説明の参照先にできる: Accessible Name and Description Computation 1.2)。
	 * 一部だけ選択中は indeterminate (DOM プロパティなので attachment で設定する)。
	 */
	let { state, onToggle }: { state: SelectionState; onToggle: () => void } = $props();

	const descriptionId = $props.id();
</script>

<th scope="col" class="w-10 px-3 py-2 text-left">
	<input
		type="checkbox"
		class="h-4 w-4 cursor-pointer align-middle accent-foreground"
		aria-label={m.common_selectRows()}
		aria-describedby={descriptionId}
		checked={state === 'all'}
		{@attach (el) => {
			el.indeterminate = state === 'some';
		}}
		onchange={onToggle}
	/>
	<span id={descriptionId} hidden>{m.common_selectAllRows()}</span>
</th>
