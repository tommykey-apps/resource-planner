<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		'data-slot': dataSlot = 'textarea',
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();

	const baseClass =
		'min-h-16 w-full border border-input bg-background px-2 py-1 text-sm ' +
		'placeholder:text-muted-foreground ' +
		'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ' +
		'aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 ' +
		'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 ' +
		'resize-none';
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(baseClass, className)}
	style="border-radius: calc(var(--radius) * 0.6); {restProps.style ?? ''}"
	bind:value
	{...restProps}
></textarea>
