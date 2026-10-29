<script lang="ts">
	import SortHeader from './SortHeader.svelte';
	import type { SortDir } from '$lib/list-table';

	let { active, dir, onSort }: { active: boolean; dir: SortDir; onSort: () => void } = $props();
</script>

<table>
	<thead>
		<tr><SortHeader label="名前" {active} {dir} {onSort} /></tr>
	</thead>
</table>
