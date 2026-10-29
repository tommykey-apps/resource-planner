<script lang="ts">
	import CaretLeft from 'phosphor-svelte/lib/CaretLeft';
	import CaretRight from 'phosphor-svelte/lib/CaretRight';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * デジタル庁「ページナビゲーション」テキスト型の移植。
	 * - ページ移動で URL が変わるので <a> を使う
	 * - 合計 1 ページなら出さない。 最初 / 最後のページでは前 / 次を出さない (disabled にしない)
	 * - nav の aria-label は対象の名前 (「ページネーション」と付けない: ロール名と読み上げが重なる)
	 */
	let {
		page,
		pageCount,
		hrefFor,
		label
	}: {
		page: number;
		pageCount: number;
		hrefFor: (page: number) => string;
		label: string;
	} = $props();

	const linkClass =
		'inline-flex items-center gap-1 px-2 py-1 text-sm underline underline-offset-4 hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
</script>

{#if pageCount > 1}
	<nav class="flex items-center justify-center gap-4" aria-label={label}>
		{#if page > 1}
			<a class={linkClass} href={hrefFor(page - 1)} data-sveltekit-noscroll>
				<CaretLeft size={16} aria-hidden="true" />
				{t('common.prevPage')}
			</a>
		{/if}
		<span class="text-sm tabular-nums">{page} / {pageCount}</span>
		{#if page < pageCount}
			<a class={linkClass} href={hrefFor(page + 1)} data-sveltekit-noscroll>
				{t('common.nextPage')}
				<CaretRight size={16} aria-hidden="true" />
			</a>
		{/if}
	</nav>
{/if}
