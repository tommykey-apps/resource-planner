<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * 一括操作バー (Carbon Data table batch actions): 1 行でも選ぶと表の上に出し、
	 * 選択件数・一括操作・右端の「選択を解除」を置く。
	 * 件数の変化は常設の live region で読み上げる (後から挿入した live region は読み上げられないことがある)。
	 */
	let { count, onClear, children }: { count: number; onClear: () => void; children: Snippet } =
		$props();
</script>

<p class="sr-only" aria-live="polite">
	{count > 0 ? t('common.selectedCount', { count }) : ''}
</p>

{#if count > 0}
	<div
		role="region"
		aria-label={t('common.bulkActions')}
		class="flex flex-wrap items-center gap-3 border border-foreground bg-muted px-3 py-2 text-sm"
	>
		<span class="font-bold">{t('common.selectedCount', { count })}</span>
		<div class="flex flex-wrap items-center gap-2">
			{@render children()}
		</div>
		<button
			type="button"
			class="ml-auto cursor-pointer underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			onclick={onClear}
		>
			{t('common.clearSelection')}
		</button>
	</div>
{/if}
