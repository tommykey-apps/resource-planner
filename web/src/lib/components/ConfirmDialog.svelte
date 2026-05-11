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
	#137: shadcn-svelte の AlertDialog.Content は内部で Portal + Overlay を mount する。

	#157 (root cause): ConfirmDialog は +layout.svelte で常駐 mount → bits-ui の Portal は
	mount 時に body へ consumer を append するため、 後から open する page 側の `<Dialog>`
	(BitsDialog.Portal) の方が body 内で **後 = 前面** になる。 両方 z-50 なので、 confirm を開いても
	page 側の Dialog 内 click target が pointer event を奪い続けて「ダイアログが押せない / 出ない」
	症状になる。 confirm は destructive 操作の最終ゲートなので必ず最前面に来るべき。

	→ AlertDialog の Overlay / Content を `z-[60]` で上書きして他 Dialog より一段上に乗せる。
	  z-50 のままだと shadcn の `cn()` が tailwind-merge で重複解消 → 後勝ち で z-[60] になる。
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
