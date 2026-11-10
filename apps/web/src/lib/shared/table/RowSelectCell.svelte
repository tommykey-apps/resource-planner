<script lang="ts">
	/**
	 * 行の選択セル。 デジタル庁「テーブル」: 行の先頭にチェックボックスを置き、
	 * aria-labelledby で行の名前 (行見出し) を指す。
	 */
	let {
		checked,
		labelledby,
		onToggle
	}: { checked: boolean; labelledby: string; onToggle: () => void } = $props();
</script>

<td class="w-10 px-3 py-2">
	<input
		type="checkbox"
		class="h-4 w-4 cursor-pointer align-middle accent-foreground"
		aria-labelledby={labelledby}
		{checked}
		onchange={onToggle}
	/>
</td>
