<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import { t } from '$lib/i18n/index.svelte';
	import SignOutForm from './SignOutForm.svelte';

	let { email = '', csrfToken }: { email?: string; csrfToken: string } = $props();

	const initial = $derived(email.length > 0 ? email[0].toUpperCase() : '?');
	const ariaLabel = $derived(
		email.length > 0 ? t('avatar.labelWithEmail', { email }) : t('avatar.label')
	);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-sm font-semibold transition-colors hover:bg-accent"
		aria-label={ariaLabel}
		title={ariaLabel}
	>
		{initial}
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content
			class="z-50 min-w-[12rem] rounded-md border border-border bg-background p-1 shadow-lg"
			sideOffset={6}
			align="end"
		>
			{#if email}
				<DropdownMenu.Item
					class="pointer-events-none px-2 py-1.5 text-xs text-muted-foreground"
					disabled
				>
					{email}
				</DropdownMenu.Item>
				<DropdownMenu.Separator class="my-1 h-px bg-border" />
			{/if}
			<DropdownMenu.Item class="p-0">
				<SignOutForm {csrfToken} label={t('avatar.signout')} />
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
