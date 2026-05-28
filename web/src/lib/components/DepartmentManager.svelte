<script lang="ts">
	import { enhance } from '$app/forms';
	import TreeStructure from 'phosphor-svelte/lib/TreeStructure';
	import { Button } from './ui/button';
	import { Input } from './ui/input';
	import Dialog from './Dialog.svelte';
	import { createSubmitState } from '$lib/forms/submit-state.svelte';
	import { translateServerError, type ServerErrors } from '$lib/forms/server-error';
	import { t } from '$lib/i18n/index.svelte';
	import { DEPARTMENT_NAME_MAX_LENGTH } from '$lib/schemas';
	import type { Department } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';

	/**
	 * 部署の管理 (#238 walking skeleton、 ADR 0013)。
	 * 現状は **作成 + フラット一覧** のみ。 ツリー表示/編集/move は #240、 削除は #241。
	 */
	let { departments }: { departments: Department[] } = $props();

	let listOpen = $state(false);
	let formOpen = $state(false);
	let formName = $state('');
	let formError = $state<string | null>(null);

	const formSubmitState = createSubmitState();

	function startCreate() {
		formName = '';
		formError = null;
		formOpen = true;
	}

	const formSubmit: SubmitFunction = formSubmitState.wrap(() => {
		formError = null;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				formOpen = false;
			} else if (result.type === 'failure') {
				const errs = (result.data as { errors?: ServerErrors })?.errors;
				formError = errs?.name ? translateServerError(errs.name) : t('errors.generic');
			}
			await update();
		};
	});
</script>

<Button variant="outline" onclick={() => (listOpen = true)}>
	<TreeStructure size={18} weight="regular" aria-hidden="true" />
	<span class="hidden sm:ml-1 sm:inline"
		>{t('departments.manageWithCount', { count: departments.length })}</span
	>
</Button>

<Dialog
	bind:open={listOpen}
	title={t('departments.manage')}
	description={t('departments.description')}
>
	<div class="flex flex-col gap-3">
		<Button onclick={startCreate}>{t('departments.add')}</Button>

		{#if departments.length === 0}
			<p class="py-4 text-center text-sm text-muted-foreground">{t('departments.empty')}</p>
		{:else}
			<ul class="divide-y divide-border border border-border">
				{#each departments as d (d.id)}
					<li class="px-3 py-2 text-sm">{d.name}</li>
				{/each}
			</ul>
		{/if}
	</div>
</Dialog>

<Dialog bind:open={formOpen} title={t('departments.createTitle')}>
	<form
		method="POST"
		action="/?/createDepartment"
		use:enhance={formSubmit}
		class="flex flex-col gap-3"
	>
		<label class="flex flex-col gap-1 text-sm">
			<span>{t('departments.name')}</span>
			<Input
				name="name"
				type="text"
				bind:value={formName}
				required
				maxlength={DEPARTMENT_NAME_MAX_LENGTH}
				autocomplete="off"
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
				{formSubmitState.submitting ? t('common.submitting') : t('common.create')}
			</Button>
		</div>
	</form>
</Dialog>
