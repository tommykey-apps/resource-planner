<script lang="ts">
	import SelectAllHeader from '$lib/shared/table/SelectAllHeader.svelte';
	import RowSelectCell from '$lib/shared/table/RowSelectCell.svelte';
	import type { SelectionState } from '$lib/shared/table/row-selection.svelte';

	let {
		state,
		checked,
		onToggleAll,
		onToggle
	}: {
		state: SelectionState;
		checked: boolean;
		onToggleAll: () => void;
		onToggle: () => void;
	} = $props();
</script>

<table>
	<thead>
		<tr><SelectAllHeader {state} onToggle={onToggleAll} /><th>名前</th></tr>
	</thead>
	<tbody>
		<tr>
			<RowSelectCell {checked} labelledby="row-a" {onToggle} />
			<th id="row-a" scope="row">佐藤</th>
		</tr>
	</tbody>
</table>
