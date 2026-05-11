<script lang="ts">
	import * as AlertDialog from './ui/alert-dialog';
	import { Button, buttonVariants } from './ui/button';
	import { cn } from '$lib/utils.js';
	import { t } from '$lib/i18n/index.svelte';
	import { confirmRequest, resolveConfirm } from '$lib/forms/confirm-dialog';

	const open = $derived($confirmRequest !== null);
	const req = $derived($confirmRequest);
</script>

<AlertDialog.Root
	{open}
	onOpenChange={(next) => {
		// 外側クリック / Escape で閉じた = cancel 扱い
		if (!next && req) resolveConfirm(false);
	}}
>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			{#if req}
				<AlertDialog.Header>
					<AlertDialog.Title>{req.title}</AlertDialog.Title>
					<AlertDialog.Description class="whitespace-pre-line">
						{req.message}
					</AlertDialog.Description>
				</AlertDialog.Header>
				<AlertDialog.Footer>
					<AlertDialog.Cancel onclick={() => resolveConfirm(false)}>
						{req.cancelLabel ?? t('common.cancel')}
					</AlertDialog.Cancel>
					<AlertDialog.Action
						class={cn(
							buttonVariants({ variant: req.destructive ? 'destructive' : 'default' })
						)}
						onclick={() => resolveConfirm(true)}
					>
						{req.confirmLabel ?? t('common.confirm')}
					</AlertDialog.Action>
				</AlertDialog.Footer>
			{/if}
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
