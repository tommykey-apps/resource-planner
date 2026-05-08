<script lang="ts">
	import { Dialog as BitsDialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		description,
		children
	}: {
		open?: boolean;
		title: string;
		description?: string;
		children: Snippet;
	} = $props();
</script>

<BitsDialog.Root bind:open>
	<BitsDialog.Portal>
		<BitsDialog.Overlay
			class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<BitsDialog.Content
			class="bg-background border-border fixed top-[50%] left-[50%] z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 border p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-lg"
			style="border-radius: var(--radius)"
		>
			<BitsDialog.Title class="text-foreground mb-1 text-base font-medium">
				{title}
			</BitsDialog.Title>
			{#if description}
				<BitsDialog.Description class="text-muted-foreground mb-4 text-sm">
					{description}
				</BitsDialog.Description>
			{/if}
			{@render children()}
		</BitsDialog.Content>
	</BitsDialog.Portal>
</BitsDialog.Root>
