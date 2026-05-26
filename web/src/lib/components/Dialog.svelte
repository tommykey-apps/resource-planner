<script lang="ts">
	import { Dialog as BitsDialog } from 'bits-ui';
	import X from 'phosphor-svelte/lib/X';
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * #201: WAI-ARIA APG Modal Dialog 準拠強化。
	 *
	 * 1. **visible close button (X icon、 top-right)** を必須化。 APG:
	 *    "It is strongly recommended that the tab sequence of all dialogs include a visible element
	 *    with role `button` that closes the dialog"
	 *    https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
	 *
	 * 2. **focus return on close**: bits-ui v2 default で `document.activeElement` を open 時に
	 *    capture → close 時に復元する。 通常の click trigger open ではこれで APG 準拠。
	 *    programmatic open (click event 由来でない open) で activeElement が不適切な場合のみ
	 *    `triggerRef` prop を渡して `onCloseAutoFocus` で明示的に復元する。
	 */
	let {
		open = $bindable(false),
		title,
		description,
		/** programmatic open 時に focus を返す trigger 要素 (option)。 通常は未指定で default 挙動。 */
		triggerRef,
		children
	}: {
		open?: boolean;
		title: string;
		description?: string;
		triggerRef?: HTMLElement | null;
		children: Snippet;
	} = $props();
</script>

<BitsDialog.Root bind:open>
	<BitsDialog.Portal>
		<BitsDialog.Overlay
			class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
		/>
		<BitsDialog.Content
			class="fixed top-[50%] left-[50%] z-50 flex max-h-[90vh] w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-6"
			style="border-radius: var(--radius)"
			onCloseAutoFocus={triggerRef
				? (e) => {
						e.preventDefault();
						triggerRef?.focus();
					}
				: undefined}
		>
			<div class="mb-1 flex items-start justify-between gap-2">
				<BitsDialog.Title class="text-base font-medium text-foreground">
					{title}
				</BitsDialog.Title>
				<!-- #201: visible close button (APG required)。 right-aligned X icon。 -->
				<BitsDialog.Close
					class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					aria-label={t('common.close')}
				>
					<X size={16} weight="bold" aria-hidden="true" />
				</BitsDialog.Close>
			</div>
			{#if description}
				<BitsDialog.Description class="mb-4 text-sm text-muted-foreground">
					{description}
				</BitsDialog.Description>
			{/if}
			{@render children()}
		</BitsDialog.Content>
	</BitsDialog.Portal>
</BitsDialog.Root>
