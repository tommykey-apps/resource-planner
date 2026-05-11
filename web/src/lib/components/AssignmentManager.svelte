<script lang="ts">
	import { enhance } from '$app/forms';
	import ListChecks from 'phosphor-svelte/lib/ListChecks';
	import { Button } from './ui/button';
	import Dialog from './Dialog.svelte';
	import { addDays } from '$lib/date';
	import { createSubmitState } from '$lib/forms/submit-state.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import type { Assignment, Resource, Project } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';

	let {
		assignments,
		resources,
		projects
	}: {
		assignments: Assignment[];
		resources: Resource[];
		projects: Project[];
	} = $props();

	let open = $state(false);

	const resourceMap = $derived(new Map(resources.map((r) => [r.id, r])));
	const projectMap = $derived(new Map(projects.map((p) => [p.id, p])));

	// startDate 昇順 → 終了日昇順でソート
	const sorted = $derived(
		[...assignments].sort((a, b) => {
			if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
			return a.endDateExclusive < b.endDateExclusive ? -1 : 1;
		})
	);

	/** DB の `endDateExclusive` を表示用 inclusive に変換 (ADR 0004)。 */
	function displayEndDate(a: Assignment): string {
		return addDays(a.endDateExclusive, -1);
	}

	// 編集 dialog (#99 item 1)。Resource / Project と一貫した CRUD パターンに揃える。
	let editOpen = $state(false);
	let editing = $state<Assignment | null>(null);
	let formResourceId = $state('');
	let formProjectId = $state('');
	let formStartDate = $state('');
	let formEndDate = $state(''); // inclusive 表示
	let formError = $state<{
		resourceId?: string;
		projectId?: string;
		startDate?: string;
		endDate?: string;
	} | null>(null);

	function startEdit(a: Assignment) {
		editing = a;
		formResourceId = a.resourceId;
		formProjectId = a.projectId;
		formStartDate = a.startDate;
		formEndDate = displayEndDate(a);
		formError = null;
		editOpen = true;
	}

	// 連打抑制 + submitting state (#94)
	const deleteSubmitState = createSubmitState();
	const deleteSubmit: SubmitFunction = deleteSubmitState.wrap();
	const editSubmitState = createSubmitState();
	const editSubmit: SubmitFunction = editSubmitState.wrap(() => {
		formError = null;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				editOpen = false;
				editing = null;
			} else if (result.type === 'failure') {
				const errs = (result.data as { errors?: Record<string, string> })?.errors;
				formError = {
					resourceId: errs?.resourceId,
					projectId: errs?.projectId,
					startDate: errs?.startDate,
					endDate: errs?.endDate
				};
			}
			await update();
		};
	});
</script>

<Button variant="outline" onclick={() => (open = true)}>
	<ListChecks size={18} weight="regular" aria-hidden="true" />
	<span class="hidden sm:ml-1 sm:inline"
		>{t('assignments.listWithCount', { count: assignments.length })}</span
	>
</Button>

<Dialog bind:open title={t('assignments.listTitle')} description={t('assignments.listDescription')}>
	<div class="flex flex-col gap-3">
		{#if sorted.length === 0}
			<p class="py-4 text-center text-sm text-muted-foreground">
				{t('assignments.empty')}<br />
				{t('assignments.emptyHint')}
			</p>
		{:else}
			<ul class="max-h-[60vh] divide-y divide-border overflow-y-auto border border-border">
				{#each sorted as a (a.id)}
					{@const resource = resourceMap.get(a.resourceId)}
					{@const project = projectMap.get(a.projectId)}
					<li class="flex items-center justify-between gap-2 px-3 py-2">
						<div class="flex flex-1 items-center gap-3 text-sm">
							<span
								class="inline-block h-3 w-3 shrink-0 border border-black/10"
								style="background-color: {project?.color ??
									'#999'}; border-radius: calc(var(--radius) * 0.4)"
								aria-hidden="true"
							></span>
							<div class="flex flex-1 flex-col">
								<span>
									{resource?.name ?? t('assignments.deletedResource')}
									<span class="text-muted-foreground">×</span>
									{project?.name ?? t('assignments.deletedProject')}
								</span>
								<span class="font-mono text-xs text-muted-foreground">
									{a.startDate} 〜 {displayEndDate(a)}
								</span>
							</div>
						</div>
						<div class="flex gap-1">
							<Button size="xs" variant="outline" onclick={() => startEdit(a)}>
								{t('common.edit')}
							</Button>
							<form
								method="POST"
								action="?/deleteAssignment"
								use:enhance={deleteSubmit}
								onsubmit={(e) => {
									const label = `${resource?.name ?? '?'} × ${project?.name ?? '?'} (${a.startDate} 〜 ${displayEndDate(a)})`;
									if (!confirm(t('assignments.confirmDelete', { label }))) {
										e.preventDefault();
									}
								}}
							>
								<input type="hidden" name="id" value={a.id} />
								<input type="hidden" name="startDate" value={a.startDate} />
								<Button
									size="xs"
									variant="destructive"
									type="submit"
									disabled={deleteSubmitState.submitting}
								>
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
	bind:open={editOpen}
	title={t('assignments.editTitle')}
	description={t('assignments.description')}
>
	<form
		method="POST"
		action="?/updateAssignment"
		use:enhance={editSubmit}
		class="flex flex-col gap-3"
	>
		{#if editing}
			<input type="hidden" name="id" value={editing.id} />
			<input type="hidden" name="prevStartDate" value={editing.startDate} />
		{/if}

		<label class="flex flex-col gap-1 text-sm">
			<span>{t('assignments.resource')}</span>
			<select
				name="resourceId"
				aria-label={t('assignments.resource')}
				bind:value={formResourceId}
				required
				class="h-9 border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				style="border-radius: calc(var(--radius) * 0.6)"
			>
				{#each resources as r (r.id)}
					<option value={r.id}>{r.name}</option>
				{/each}
			</select>
			{#if formError?.resourceId}
				<span class="text-xs text-destructive">{formError.resourceId}</span>
			{/if}
		</label>

		<label class="flex flex-col gap-1 text-sm">
			<span>{t('assignments.project')}</span>
			<select
				name="projectId"
				aria-label={t('assignments.project')}
				bind:value={formProjectId}
				required
				class="h-9 border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				style="border-radius: calc(var(--radius) * 0.6)"
			>
				{#each projects as p (p.id)}
					<option value={p.id}>{p.name}</option>
				{/each}
			</select>
			{#if formError?.projectId}
				<span class="text-xs text-destructive">{formError.projectId}</span>
			{/if}
		</label>

		<div class="grid grid-cols-2 gap-3">
			<label class="flex flex-col gap-1 text-sm">
				<span>{t('assignments.startDate')}</span>
				<input
					name="startDate"
					type="date"
					bind:value={formStartDate}
					required
					class="h-9 border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					style="border-radius: calc(var(--radius) * 0.6)"
				/>
				{#if formError?.startDate}
					<span class="text-xs text-destructive">{formError.startDate}</span>
				{/if}
			</label>

			<label class="flex flex-col gap-1 text-sm">
				<span>{t('assignments.endDate')}</span>
				<input
					name="endDate"
					type="date"
					bind:value={formEndDate}
					required
					min={formStartDate}
					class="h-9 border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					style="border-radius: calc(var(--radius) * 0.6)"
				/>
				{#if formError?.endDate}
					<span class="text-xs text-destructive">{formError.endDate}</span>
				{/if}
			</label>
		</div>

		<div class="mt-2 flex justify-end gap-2">
			<Button
				variant="ghost"
				type="button"
				onclick={() => (editOpen = false)}
				disabled={editSubmitState.submitting}
			>
				{t('common.cancel')}
			</Button>
			<Button type="submit" disabled={editSubmitState.submitting}>
				{editSubmitState.submitting ? t('common.submitting') : t('common.update')}
			</Button>
		</div>
	</form>
</Dialog>
