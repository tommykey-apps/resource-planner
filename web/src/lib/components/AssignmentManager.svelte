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

	// 連打抑制 + submitting state (#94)
	const deleteSubmitState = createSubmitState();
	const deleteSubmit: SubmitFunction = deleteSubmitState.wrap();
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
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Dialog>
