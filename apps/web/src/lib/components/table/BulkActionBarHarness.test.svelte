<script lang="ts">
	import BulkActionBar from './BulkActionBar.svelte';

	let { count, onClear }: { count: number; onClear: () => void } = $props();
</script>

<BulkActionBar {count} {onClear}>
	<button type="button" data-testid="action">削除</button>
</BulkActionBar>
