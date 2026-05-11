<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { addDays } from '$lib/date';
	import { confirmDialog } from '$lib/forms/confirm-dialog';
	import { t } from '$lib/i18n/index.svelte';
	import AssignmentEditor from '$lib/components/AssignmentEditor.svelte';
	import {
		applyAssignmentParams,
		parseAssignmentParams,
		type AssignmentFilters
	} from '$lib/assignments-url-state';
	import type { Assignment } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const resources = $derived(data.resources);
	const projects = $derived(data.projects);
	const assignments = $derived(data.assignments);

	const resourceMap = $derived(new Map(resources.map((r) => [r.id, r])));
	const projectMap = $derived(new Map(projects.map((p) => [p.id, p])));

	// URL → filter state (初期化 + reactive 更新)
	const initial = parseAssignmentParams(page.url.searchParams);
	let filters = $state<AssignmentFilters>(initial);

	// filter → URL (replaceState で history を汚さない)
	$effect(() => {
		if (typeof window === 'undefined') return;
		const next = applyAssignmentParams(new URL(window.location.href), filters);
		if (next.toString() !== window.location.href) {
			goto(next, { replaceState: true, noScroll: true, keepFocus: true });
		}
	});

	function displayEndDate(a: Assignment): string {
		return addDays(a.endDateExclusive, -1);
	}

	function duration(a: Assignment): number {
		// inclusive 日数 = endDateExclusive - startDate (in days)
		const start = new Date(a.startDate).getTime();
		const end = new Date(a.endDateExclusive).getTime();
		return Math.max(1, Math.round((end - start) / 86_400_000));
	}

	const filtered = $derived.by(() => {
		const q = filters.q.toLowerCase();
		return assignments
			.filter((a) => {
				if (filters.resourceId && a.resourceId !== filters.resourceId) return false;
				if (filters.projectId && a.projectId !== filters.projectId) return false;
				if (filters.from && a.startDate < filters.from) return false;
				if (filters.to && a.startDate > filters.to) return false;
				if (q) {
					const resourceName = resourceMap.get(a.resourceId)?.name?.toLowerCase() ?? '';
					const projectName = projectMap.get(a.projectId)?.name?.toLowerCase() ?? '';
					if (!resourceName.includes(q) && !projectName.includes(q)) return false;
				}
				return true;
			})
			.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
	});

	let editing = $state<Assignment | null>(null);
	let editOpen = $state(false);

	function openEditor(a: Assignment) {
		editing = a;
		editOpen = true;
	}

	/** #132: assignment の delete 確認 dialog (window.confirm 代替)。 */
	function makeDeleteSubmit(args: { label: string }): SubmitFunction {
		return async ({ cancel }) => {
			const ok = await confirmDialog({
				title: t('common.confirm'),
				message: t('assignments.confirmDelete', { label: args.label }),
				confirmLabel: t('common.delete'),
				destructive: true
			});
			if (!ok) cancel();
		};
	}

	function clearFilters() {
		filters = { q: '', resourceId: '', projectId: '', from: '', to: '' };
	}
</script>

<svelte:head>
	<title>{t('assignments.listTitle')} — {t('app.title')}</title>
</svelte:head>

<main class="mx-auto max-w-[1200px] px-4 py-6">
	<div class="mb-4 flex items-center justify-between gap-2">
		<h1 class="text-xl font-semibold">{t('assignments.listTitle')}</h1>
		<Button variant="outline" onclick={() => (window.location.href = '/')}>
			{t('errorPage.goHome')}
		</Button>
	</div>

	<div class="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-5">
		<input
			type="search"
			bind:value={filters.q}
			placeholder={t('assignments.searchPlaceholder')}
			aria-label={t('assignments.searchPlaceholder')}
			class="h-9 rounded border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		/>
		<select
			bind:value={filters.resourceId}
			aria-label={t('assignments.resource')}
			class="h-9 rounded border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			<option value="">{t('assignments.allResources')}</option>
			{#each resources as r (r.id)}
				<option value={r.id}>{r.name}</option>
			{/each}
		</select>
		<select
			bind:value={filters.projectId}
			aria-label={t('assignments.project')}
			class="h-9 rounded border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			<option value="">{t('assignments.allProjects')}</option>
			{#each projects as p (p.id)}
				<option value={p.id}>{p.name}</option>
			{/each}
		</select>
		<input
			type="date"
			bind:value={filters.from}
			aria-label={t('assignments.startDate')}
			class="h-9 rounded border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		/>
		<input
			type="date"
			bind:value={filters.to}
			aria-label={t('assignments.endDate')}
			class="h-9 rounded border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		/>
	</div>

	<div class="mb-2 flex items-center justify-between text-xs text-muted-foreground">
		<span>{t('assignments.matchCount', { count: filtered.length })}</span>
		<button type="button" class="cursor-pointer underline" onclick={clearFilters}>
			{t('assignments.clearFilters')}
		</button>
	</div>

	{#if filtered.length === 0}
		<div class="rounded border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
			{t('assignments.noMatches')}
		</div>
	{:else}
		<div class="overflow-x-auto rounded border border-border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{t('assignments.resource')}</Table.Head>
						<Table.Head>{t('assignments.project')}</Table.Head>
						<Table.Head>{t('assignments.startDate')}</Table.Head>
						<Table.Head>{t('assignments.endDate')}</Table.Head>
						<Table.Head class="text-right">{t('assignments.durationDays')}</Table.Head>
						<Table.Head class="text-right">{t('common.edit')} / {t('common.delete')}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filtered as a (a.id)}
						{@const resource = resourceMap.get(a.resourceId)}
						{@const project = projectMap.get(a.projectId)}
						<Table.Row>
							<Table.Cell>{resource?.name ?? t('assignments.deletedResource')}</Table.Cell>
							<Table.Cell>
								<span class="inline-flex items-center gap-2">
									<span
										class="inline-block h-3 w-3 shrink-0 rounded-sm border border-black/10"
										style="background-color: {project?.color ?? '#999'}"
										aria-hidden="true"
									></span>
									{project?.name ?? t('assignments.deletedProject')}
								</span>
							</Table.Cell>
							<Table.Cell class="font-mono text-xs">{a.startDate}</Table.Cell>
							<Table.Cell class="font-mono text-xs">{displayEndDate(a)}</Table.Cell>
							<Table.Cell class="text-right font-mono text-xs">{duration(a)}</Table.Cell>
							<Table.Cell class="text-right">
								<div class="flex justify-end gap-1">
									<Button size="xs" variant="outline" onclick={() => openEditor(a)}>
										{t('common.edit')}
									</Button>
									<form
										method="POST"
										action="/?/deleteAssignment"
										use:enhance={makeDeleteSubmit({
											label: `${resource?.name ?? '?'} × ${project?.name ?? '?'} (${a.startDate} 〜 ${displayEndDate(a)})`
										})}
									>
										<input type="hidden" name="id" value={a.id} />
										<input type="hidden" name="startDate" value={a.startDate} />
										<Button size="xs" variant="destructive" type="submit">
											{t('common.delete')}
										</Button>
									</form>
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</main>

<AssignmentEditor bind:open={editOpen} assignment={editing} {resources} {projects} />
