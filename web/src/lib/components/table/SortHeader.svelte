<script lang="ts">
	import type { SortDir } from '$lib/list-table';

	/**
	 * 並び替えできる列の見出しセル。 デジタル庁「テーブル」ソート機能のマークアップを移植:
	 * - 見出しテキストとアイコンの両方を button (クリック領域) にし、 テキストに下線を付ける
	 * - aria-sort は並び替え中の列だけに付ける (WAI-ARIA APG Sortable Table)
	 * - アイコンは公式の 3 種 (未ソート / 昇順 / 降順) で、 形で状態を区別する
	 */
	let {
		label,
		active,
		dir,
		onSort,
		align = 'left'
	}: {
		label: string;
		active: boolean;
		dir: SortDir;
		onSort: () => void;
		align?: 'left' | 'right';
	} = $props();

	// 公式 table.md「ソートアイコン」の path をそのまま使う。
	const ICON_PATH = {
		none: 'M17 18.11L21.27 14L22 14.7L16.5 20L11 14.7L11.73 14L16 18.12V4H17V18.12ZM8 5.88L12.27 10L13 9.3L7.5 4L2 9.3L2.73 10L7 5.88V20H8V5.88Z',
		asc: 'M17 18.12L21.27 14L22 14.7L16.5 20L11 14.7L11.73 14L16 18.12V4H17V18.12ZM14 8.92L11.73 11L9 8.52V20H6V8.52L3.27 11L1 8.93L7.5 3L14 8.93Z',
		desc: 'M7 5.88L2.73 10L2 9.3L7.5 4L13 9.3L12.27 10L8 5.88V20H7V5.88ZM10 15.08L12.27 13L15 15.48V4H18V15.48L20.73 13L23 15.07L16.5 21L10 15.07Z'
	} as const;

	const state = $derived(active ? dir : 'none');
	const ariaSort = $derived(
		active ? (dir === 'asc' ? ('ascending' as const) : ('descending' as const)) : undefined
	);
</script>

<th
	scope="col"
	aria-sort={ariaSort}
	class="px-3 py-2 font-bold whitespace-nowrap"
	class:text-left={align === 'left'}
	class:text-right={align === 'right'}
>
	<button
		type="button"
		class="inline-flex cursor-pointer items-center gap-1 font-bold underline underline-offset-4 hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		onclick={onSort}
	>
		{label}
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="currentcolor"
			aria-hidden="true"
			class="shrink-0"
		>
			<path d={ICON_PATH[state]} />
		</svg>
	</button>
</th>
