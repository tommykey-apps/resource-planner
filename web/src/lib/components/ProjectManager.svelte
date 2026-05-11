<script lang="ts">
	import { enhance } from '$app/forms';
	import Folder from 'phosphor-svelte/lib/Folder';
	import { Button } from './ui/button';
	import Dialog from './Dialog.svelte';
	import { createSubmitState } from '$lib/forms/submit-state.svelte';
	import { confirmDialog } from '$lib/forms/confirm-dialog';
	import { translateServerError, type ServerErrors } from '$lib/forms/server-error';
	import { t } from '$lib/i18n/index.svelte';
	import type { Project, Assignment } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';

	let {
		projects,
		assignments
	}: {
		projects: Project[];
		assignments: Assignment[];
	} = $props();

	/** 各 Project に紐づく Assignment 数 (cascade delete 警告用、UC-06) */
	const assignmentCountByProject = $derived.by(() => {
		const m = new Map<string, number>();
		for (const a of assignments) {
			m.set(a.projectId, (m.get(a.projectId) ?? 0) + 1);
		}
		return m;
	});

	const DEFAULT_COLOR = '#4D72F3';

	let listOpen = $state(false);
	let formOpen = $state(false);
	let editing = $state<Project | null>(null);
	let formName = $state('');
	let formColor = $state(DEFAULT_COLOR);
	let formError = $state<{ name?: string; color?: string } | null>(null);

	function startCreate() {
		editing = null;
		formName = '';
		formColor = DEFAULT_COLOR;
		formError = null;
		formOpen = true;
	}

	function startEdit(p: Project) {
		editing = p;
		formName = p.name;
		formColor = p.color;
		formError = null;
		formOpen = true;
	}

	// 連打抑制 + submitting state (#94)。delete は #132 で confirm dialog が modal ブロックする。
	const formSubmitState = createSubmitState();

	const formSubmit: SubmitFunction = formSubmitState.wrap(() => {
		formError = null;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				formOpen = false;
				editing = null;
			} else if (result.type === 'failure') {
				const errs = (result.data as { errors?: ServerErrors })?.errors;
				formError = {
					name: errs?.name ? translateServerError(errs.name) : undefined,
					color: errs?.color ? translateServerError(errs.color) : undefined
				};
			}
			await update();
		};
	});

	/** #132: project の delete 確認 dialog (window.confirm の代替)。 */
	function makeDeleteSubmit(args: { name: string; count: number }): SubmitFunction {
		return async ({ cancel }) => {
			const msg =
				args.count > 0
					? t('projects.confirmDeleteWithAssignments', { name: args.name, count: args.count })
					: t('projects.confirmDelete', { name: args.name });
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
	<Folder size={18} weight="regular" aria-hidden="true" />
	<span class="hidden sm:ml-1 sm:inline"
		>{t('projects.manageWithCount', { count: projects.length })}</span
	>
</Button>

<Dialog bind:open={listOpen} title={t('projects.manage')} description={t('projects.description')}>
	<div class="flex flex-col gap-3">
		<Button onclick={startCreate}>{t('projects.add')}</Button>

		{#if projects.length === 0}
			<p class="py-4 text-center text-sm text-muted-foreground">{t('projects.empty')}</p>
		{:else}
			<ul class="divide-y divide-border border border-border">
				{#each projects as p (p.id)}
					{@const count = assignmentCountByProject.get(p.id) ?? 0}
					<li class="flex items-center justify-between gap-2 px-3 py-2">
						<span class="flex items-center gap-2 text-sm">
							<span
								class="inline-block h-4 w-4 border border-black/10"
								style="background-color: {p.color}; border-radius: calc(var(--radius) * 0.4)"
								aria-hidden="true"
							></span>
							{p.name}
							<span class="text-xs text-muted-foreground"
								>{t('projects.assignmentCount', { count })}</span
							>
						</span>
						<div class="flex gap-1">
							<Button size="xs" variant="outline" onclick={() => startEdit(p)}
								>{t('common.edit')}</Button
							>
							<form
								method="POST"
								action="?/deleteProject"
								use:enhance={makeDeleteSubmit({ name: p.name, count })}
							>
								<input type="hidden" name="id" value={p.id} />
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

<Dialog bind:open={formOpen} title={editing ? t('projects.editTitle') : t('projects.createTitle')}>
	<form
		method="POST"
		action={editing ? '?/updateProject' : '?/createProject'}
		use:enhance={formSubmit}
		class="flex flex-col gap-3"
	>
		{#if editing}
			<input type="hidden" name="id" value={editing.id} />
		{/if}

		<label class="flex flex-col gap-1 text-sm">
			<span>{t('projects.name')}</span>
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
			{#if formError?.name}
				<span class="text-xs text-destructive">{formError.name}</span>
			{/if}
		</label>

		<label class="flex flex-col gap-1 text-sm">
			<span>{t('projects.color')}</span>
			<div class="flex items-center gap-2">
				<input
					name="color"
					type="color"
					bind:value={formColor}
					class="h-9 w-14 cursor-pointer border border-input bg-transparent"
					style="border-radius: calc(var(--radius) * 0.6)"
				/>
				<span class="font-mono text-xs text-muted-foreground">{formColor}</span>
			</div>
			{#if formError?.color}
				<span class="text-xs text-destructive">{formError.color}</span>
			{/if}
		</label>

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
