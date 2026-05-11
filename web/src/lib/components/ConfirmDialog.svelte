<script lang="ts">
	import * as AlertDialog from './ui/alert-dialog';
	import { buttonVariants } from './ui/button';
	import { cn } from '$lib/utils.js';
	import { t } from '$lib/i18n/index.svelte';
	import { confirmRequest, resolveConfirm } from '$lib/forms/confirm-dialog';

	const open = $derived($confirmRequest !== null);
	const req = $derived($confirmRequest);
</script>

<!--
	#137: shadcn-svelte の AlertDialog.Content は内部で Portal + Overlay を mount するため
	outer に `<AlertDialog.Portal>` / `<AlertDialog.Overlay />` を書くと **二重 Portal / 二重 Overlay**
	になる (overlay の bg が暗くなる、focus trap 二重発火の risk)。shadcn 公式 example に揃えて
	Root → Content の直構成にする。
-->
<AlertDialog.Root
	{open}
	onOpenChange={(next) => {
		// 外側クリック / Escape で閉じた = cancel 扱い
		if (!next && req) resolveConfirm(false);
	}}
>
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
					class={cn(buttonVariants({ variant: req.destructive ? 'destructive' : 'default' }))}
					onclick={() => resolveConfirm(true)}
				>
					{req.confirmLabel ?? t('common.confirm')}
				</AlertDialog.Action>
			</AlertDialog.Footer>
		{/if}
	</AlertDialog.Content>
</AlertDialog.Root>
