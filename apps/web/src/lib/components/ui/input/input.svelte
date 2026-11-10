<script lang="ts">
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		'data-slot': dataSlot = 'input',
		...restProps
	}: Props = $props();

	// #177-ext: 既存 4 form の hardcode class (h-9 / border / focus-visible:ring 等) と同等を
	// flat に記述。 button は tv() で variant 分岐するが Input は variant が無いため flat で十分。
	const baseClass =
		'h-9 w-full min-w-0 border border-input bg-background px-2 text-sm ' +
		'placeholder:text-muted-foreground ' +
		'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ' +
		'aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 ' +
		'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50';
</script>

{#if type === 'file'}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(baseClass, 'file:inline-flex file:border-0 file:bg-transparent', className)}
		style="border-radius: calc(var(--radius) * 0.6); {restProps.style ?? ''}"
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(baseClass, className)}
		style="border-radius: calc(var(--radius) * 0.6); {restProps.style ?? ''}"
		{type}
		bind:value
		{...restProps}
	/>
{/if}
