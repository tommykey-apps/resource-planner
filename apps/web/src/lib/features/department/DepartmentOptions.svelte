<script lang="ts">
	import type { Department } from '@resource-planner/db/entities';

	/**
	 * 部署の木 (`flattenDepartmentTree` の結果) を `<select>` の選択肢として字下げして並べる。
	 * 「すべて」「未所属」などの先頭の選択肢は呼び出し側で書く。
	 */
	let { tree }: { tree: { dept: Department; depth: number }[] } = $props();
</script>

{#each tree as { dept, depth } (dept.id)}
	<option value={dept.id}>{'\u00A0\u00A0'.repeat(depth)}{dept.name}</option>
{/each}
