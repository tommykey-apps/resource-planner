<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * デジタル庁「テーブル」モバイル表示の公式 scroll-shadow.js (<dads-scroll-shadow>) を Svelte に移植。
	 * 公式はカスタム要素が子要素を DOM に差し込むため、 Svelte 管理下の DOM と衝突しないよう
	 * シャドー要素を markup に持ち、 表示判定 (scrollLeft / clientWidth / scrollWidth) だけを移す。
	 *
	 * 領域はキーボードでスクロールできるよう tabindex=0 にし、 role=region + aria-labelledby で名前を付ける
	 * (Adrian Roselli "Under-Engineered Responsive Tables"、 WCAG 2.1.1 / 4.1.2)。
	 */
	let { labelledby, children }: { labelledby: string; children: Snippet } = $props();

	let el = $state<HTMLDivElement | null>(null);
	let left = $state(false);
	let right = $state(false);

	function update() {
		if (!el) return;
		left = el.scrollLeft > 0;
		// 端数 px の丸め誤差で右端に届かない判定にならないよう 1px の余裕を持たせる。
		right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
	}

	$effect(() => {
		if (!el) return;
		update();
		const observer = new ResizeObserver(update);
		observer.observe(el);
		return () => observer.disconnect();
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (スクロール領域はキーボードで focus できる必要がある: axe scrollable-region-focusable / WCAG 2.1.1) -->
<div
	bind:this={el}
	role="region"
	aria-labelledby={labelledby}
	tabindex="0"
	class="relative flex overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	onscroll={update}
>
	<div
		data-scroll-shadow="left"
		aria-hidden="true"
		class="pointer-events-none sticky left-0 z-10 -mr-6 w-6 shrink-0 bg-gradient-to-r from-black/40 to-transparent transition-opacity duration-300"
		class:opacity-0={!left}
	></div>
	<div class="min-w-0 flex-1">
		{@render children()}
	</div>
	<div
		data-scroll-shadow="right"
		aria-hidden="true"
		class="pointer-events-none sticky right-0 z-10 -ml-6 w-6 shrink-0 bg-gradient-to-l from-black/40 to-transparent transition-opacity duration-300"
		class:opacity-0={!right}
	></div>
</div>
