<script lang="ts">
	import { enhance } from '$app/forms';
	import Users from 'phosphor-svelte/lib/Users';
	import { Button } from './ui/button';
	import Dialog from './Dialog.svelte';
	import { createSubmitState } from '$lib/forms/submit-state.svelte';
	import { confirmDialog } from '$lib/forms/confirm-dialog';
	import { translateServerError, type ServerErrors } from '$lib/forms/server-error';
	import { t } from '$lib/i18n/index.svelte';
	import type { Resource, Assignment } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';

	let {
		resources,
		assignments,
		onOptimisticCreate,
		onConfirmCreate,
		onRollbackCreate
	}: {
		resources: Resource[];
		assignments: Assignment[];
		/** #121 optimistic UI hooks。create 時に temp → server entity の swap を親で行う。 */
		onOptimisticCreate?: (temp: Resource) => void;
		onConfirmCreate?: (temp: Resource, real: Resource) => void;
		onRollbackCreate?: (temp: Resource) => void;
	} = $props();

	/** 各 Resource に紐づく Assignment 数 (cascade delete 時の警告で使う、UC-06) */
	const assignmentCountByResource = $derived.by(() => {
		const m = new Map<string, number>();
		for (const a of assignments) {
			m.set(a.resourceId, (m.get(a.resourceId) ?? 0) + 1);
		}
		return m;
	});

	let listOpen = $state(false);
	let formOpen = $state(false);
	let editing = $state<Resource | null>(null);
	let formName = $state('');
	let formError = $state<string | null>(null);

	// 連打抑制 + submitting state (#94)。create / update form 用 (delete は #132 で confirm dialog が modal ブロックするため不要)。
	const formSubmitState = createSubmitState();

	function startCreate() {
		editing = null;
		formName = '';
		formError = null;
		formOpen = true;
	}

	function startEdit(r: Resource) {
		editing = r;
		formName = r.name;
		formError = null;
		formOpen = true;
	}

	/**
	 * Optimistic UI for create (#121):
	 * - submit 前に temp ID 付きの Resource を親 state に即時追加 (dialog も即時 close)
	 * - server success → 親で temp → real swap、`update()` は不要 (refetch 回避)
	 * - server failure → 親で temp 削除 + 親側で toast、form は再 open しないので入力は失う設計
	 *   (HTML5 required / maxlength でクライアント側 validation は通過済の前提)
	 * Update path (editing 時) は従来通り `update()` で invalidateAll、後続 PR で同 pattern 化候補。
	 */
	let pendingTemp: Resource | null = null;

	const formSubmit: SubmitFunction = formSubmitState.wrap(({ formData }) => {
		formError = null;
		const isCreate = !editing && !!onOptimisticCreate;
		if (isCreate) {
			const name = (formData.get('name') ?? '').toString().trim();
			if (name.length > 0) {
				pendingTemp = { id: `temp-${crypto.randomUUID()}`, name };
				onOptimisticCreate(pendingTemp);
				formOpen = false; // dialog 即時 close
			}
		}
		return async ({ result, update }) => {
			if (isCreate && pendingTemp) {
				const tempSnapshot = pendingTemp;
				pendingTemp = null;
				if (result.type === 'success') {
					const real = (result.data as { resource?: Resource })?.resource;
					if (real && onConfirmCreate) onConfirmCreate(tempSnapshot, real);
				} else {
					if (onRollbackCreate) onRollbackCreate(tempSnapshot);
				}
				return; // optimistic は update() 不要
			}
			if (result.type === 'success') {
				formOpen = false;
				editing = null;
			} else if (result.type === 'failure') {
				const errs = (result.data as { errors?: ServerErrors })?.errors;
				formError = errs?.name ? translateServerError(errs.name) : t('errors.generic');
			}
			await update();
		};
	});

	/**
	 * #132: delete 押下時に confirmDialog (= bits-ui AlertDialog、i18n 完全対応) を await し、
	 * cancel 押下なら enhance の cancel() で form action 自体を抑止する。
	 * window.confirm の OS-native ボタンが locale に乗らない問題の代替。連打抑制は dialog が
	 * modal で UI ブロックするので submit-state wrap 不要。
	 */
	function makeDeleteSubmit(args: { name: string; count: number }): SubmitFunction {
		return async ({ cancel }) => {
			const msg =
				args.count > 0
					? t('resources.confirmDeleteWithAssignments', { name: args.name, count: args.count })
					: t('resources.confirmDelete', { name: args.name });
			const ok = await confirmDialog({
				title: t('common.confirm'),
				message: msg,
				confirmLabel: t('common.delete'),
				destructive: true
			});
			if (!ok) cancel();
		};
	}
</script>

<Button variant="outline" onclick={() => (listOpen = true)}>
	<Users size={18} weight="regular" aria-hidden="true" />
	<span class="hidden sm:ml-1 sm:inline"
		>{t('resources.manageWithCount', { count: resources.length })}</span
	>
</Button>

<Dialog bind:open={listOpen} title={t('resources.manage')} description={t('resources.description')}>
	<div class="flex flex-col gap-3">
		<Button onclick={startCreate}>{t('resources.add')}</Button>

		{#if resources.length === 0}
			<p class="py-4 text-center text-sm text-muted-foreground">{t('resources.empty')}</p>
		{:else}
			<ul class="divide-y divide-border border border-border">
				{#each resources as r (r.id)}
					{@const count = assignmentCountByResource.get(r.id) ?? 0}
					<li class="flex items-center justify-between gap-2 px-3 py-2">
						<span class="text-sm">
							{r.name}
							<span class="ml-1 text-xs text-muted-foreground"
								>{t('resources.assignmentCount', { count })}</span
							>
						</span>
						<div class="flex gap-1">
							<Button size="xs" variant="outline" onclick={() => startEdit(r)}
								>{t('common.edit')}</Button
							>
							<form
								method="POST"
								action="?/deleteResource"
								use:enhance={makeDeleteSubmit({
									name: r.name,
									count
								})}
							>
								<input type="hidden" name="id" value={r.id} />
								<Button size="xs" variant="destructive" type="submit">
									{t('common.delete')}
								</Button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Dialog>

<Dialog
	bind:open={formOpen}
	title={editing ? t('resources.editTitle') : t('resources.createTitle')}
>
	<form
		method="POST"
		action={editing ? '?/updateResource' : '?/createResource'}
		use:enhance={formSubmit}
		class="flex flex-col gap-3"
	>
		{#if editing}
			<input type="hidden" name="id" value={editing.id} />
		{/if}
		<label class="flex flex-col gap-1 text-sm">
			<span>{t('resources.name')}</span>
			<input
				name="name"
				type="text"
				bind:value={formName}
				required
				maxlength="100"
				autocomplete="off"
				class="h-9 border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				style="border-radius: calc(var(--radius) * 0.6)"
			/>
		</label>
		{#if formError}
			<p class="text-xs text-destructive">{formError}</p>
		{/if}
		<div class="mt-2 flex justify-end gap-2">
			<Button
				variant="ghost"
				type="button"
				onclick={() => (formOpen = false)}
				disabled={formSubmitState.submitting}
			>
				{t('common.cancel')}
			</Button>
			<Button type="submit" disabled={formSubmitState.submitting}>
				{formSubmitState.submitting
					? t('common.submitting')
					: editing
						? t('common.update')
						: t('common.create')}
			</Button>
		</div>
	</form>
</Dialog>
