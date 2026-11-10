<script lang="ts">
	import DepartmentOptions from '$lib/features/department/DepartmentOptions.svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Button } from '$lib/shared/ui/shadcn/button';
	import * as Table from '$lib/shared/ui/shadcn/table';
	import { addDays, parseLocalDate } from '$lib/shared/date/date';
	import { confirmDialog } from '$lib/shared/dialog/confirm-dialog';
	import { m } from '$lib/shared/i18n/paraglide/messages.js';
	import AssignmentCreator from '$lib/features/assignment/AssignmentCreator.svelte';
	import AssignmentEditor from '$lib/features/assignment/AssignmentEditor.svelte';
	import ProjectDetailView from '$lib/features/project/ProjectDetailView.svelte';
	import {
		applyAssignmentParams,
		parseAssignmentParams,
		type AssignmentFilters
	} from '$lib/features/assignment/list-url-state';
	import { overlapsPeriod } from '$lib/features/assignment/period';
	import {
		flattenDepartmentTree,
		idsForDepartmentFilter,
		DEPARTMENT_FILTER_UNASSIGNED,
		DEPARTMENT_FILTER_ALL
	} from '$lib/features/department/tree';
	import { syncStateToUrl } from '$lib/shared/url-state/url-state.svelte';
	import type { Assignment } from '@resource-planner/db/entities';
	import type { ProjectWithRenderedDescription } from '$lib/features/project/types';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const resources = $derived(data.resources);
	const projects = $derived(data.projects);
	const assignments = $derived(data.assignments);
	const departments = $derived(data.departments);
	// #242: 部署フィルタ用の indent 付き選択肢。
	const departmentOptions = $derived(flattenDepartmentTree(departments));

	const resourceMap = $derived(new Map(resources.map((r) => [r.id, r])));
	const projectMap = $derived(new Map(projects.map((p) => [p.id, p])));

	// URL → filter state (初期化 + reactive 更新)。 sync は `syncStateToUrl` helper で集約 (#174)。
	const initial = parseAssignmentParams(page.url.searchParams, new Date());
	let filters = $state<AssignmentFilters>(initial);
	// ADR 0015: filters.departmentId には利用者が選んだ値 (URL) だけを持つ。 未選択 ('') の間は
	// ログインユーザーの部署を使う。 props は $derived で読み、 最新の値を追う (Svelte 公式)。
	const departmentId = $derived(filters.departmentId || data.defaultDepartmentFilter);
	syncStateToUrl(() => ({ ...filters, departmentId }), applyAssignmentParams);

	function displayEndDate(a: Assignment): string {
		return addDays(a.endDateExclusive, -1);
	}

	function duration(a: Assignment): number {
		// inclusive 日数 = endDateExclusive - startDate (in days)。
		// ADR 0004 の精神 (localDate 解釈を散らさない) に従い `parseLocalDate` 経由で host TZ
		// 暦日として解釈、 UTC parse による日跨ぎズレを防ぐ。
		const start = parseLocalDate(a.startDate).getTime();
		const end = parseLocalDate(a.endDateExclusive).getTime();
		return Math.max(1, Math.round((end - start) / 86_400_000));
	}

	// #242: 部署フィルタ (子孫含む) にマッチする resource id 集合。 null = フィルタなし。
	const deptResourceIds = $derived(idsForDepartmentFilter(departments, resources, departmentId));

	const filtered = $derived.by(() => {
		const q = filters.q.toLowerCase();
		return assignments
			.filter((a) => {
				if (filters.resourceId && a.resourceId !== filters.resourceId) return false;
				if (filters.projectId && a.projectId !== filters.projectId) return false;
				if (deptResourceIds && !deptResourceIds.has(a.resourceId)) return false;
				if (!overlapsPeriod(a, filters.from, filters.to)) return false;
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
				title: m.common_confirm(),
				message: m.assignments_confirmDelete({ label: args.label }),
				confirmLabel: m.common_delete(),
				destructive: true
			});
			if (!ok) cancel();
		};
	}

	function clearFilters() {
		// 部署は「すべて」を明示する (空にすると次の読み込みで初期値の自分の部署に戻るため)。
		// 期間の空は URL に空のキーとして残り、 再読み込みしても今月に戻らない。
		filters = {
			q: '',
			resourceId: '',
			projectId: '',
			departmentId: DEPARTMENT_FILTER_ALL,
			from: '',
			to: ''
		};
	}

	// PR-N4: project 名 button click で詳細 modal を開く。
	let detailOpen = $state(false);
	let detailProject = $state<ProjectWithRenderedDescription | null>(null);

	function openDetail(p: ProjectWithRenderedDescription) {
		detailProject = p;
		detailOpen = true;
	}
</script>

<svelte:head>
	<title>{m.assignments_listTitle()} — {m.app_title()}</title>
</svelte:head>

<main class="mx-auto max-w-[1200px] px-4 py-6">
	<div class="mb-4 flex items-center justify-between gap-2">
		<h1 class="m-0 text-xl font-semibold">{m.assignments_listTitle()}</h1>
		<AssignmentCreator {resources} {projects} />
	</div>

	<div class="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-6">
		<input
			type="search"
			bind:value={filters.q}
			placeholder={m.assignments_searchPlaceholder()}
			aria-label={m.assignments_searchPlaceholder()}
			class="h-9 rounded border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		/>
		<select
			bind:value={() => departmentId, (v) => (filters.departmentId = v)}
			aria-label={m.departments_field()}
			class="h-9 rounded border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			<option value={DEPARTMENT_FILTER_ALL}>{m.departments_allOption()}</option>
			<option value={DEPARTMENT_FILTER_UNASSIGNED}>{m.departments_unassigned()}</option>
			<DepartmentOptions tree={departmentOptions} />
		</select>
		<select
			bind:value={filters.resourceId}
			aria-label={m.assignments_resource()}
			class="h-9 rounded border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			<option value="">{m.assignments_allResources()}</option>
			{#each resources as r (r.id)}
				<option value={r.id}>{r.name}</option>
			{/each}
		</select>
		<select
			bind:value={filters.projectId}
			aria-label={m.assignments_project()}
			class="h-9 rounded border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			<option value="">{m.assignments_allProjects()}</option>
			{#each projects as p (p.id)}
				<option value={p.id}>{p.name}</option>
			{/each}
		</select>
		<input
			type="date"
			bind:value={filters.from}
			aria-label={m.assignments_startDate()}
			class="h-9 rounded border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		/>
		<input
			type="date"
			bind:value={filters.to}
			aria-label={m.assignments_endDate()}
			class="h-9 rounded border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		/>
	</div>

	<div class="mb-2 flex items-center justify-between text-xs text-muted-foreground">
		<span>{m.assignments_matchCount({ count: filtered.length })}</span>
		<button type="button" class="cursor-pointer underline" onclick={clearFilters}>
			{m.assignments_clearFilters()}
		</button>
	</div>

	{#snippet rowActions(
		a: Assignment,
		resource: (typeof resources)[number] | undefined,
		project: (typeof projects)[number] | undefined
	)}
		<div class="flex justify-end gap-1">
			<Button size="xs" variant="outline" onclick={() => openEditor(a)}>
				{m.common_edit()}
			</Button>
			<form
				method="POST"
				action="?/deleteAssignment"
				use:enhance={makeDeleteSubmit({
					label: `${resource?.name ?? '?'} × ${project?.name ?? '?'} (${a.startDate} 〜 ${displayEndDate(a)})`
				})}
			>
				<input type="hidden" name="id" value={a.id} />
				<Button size="xs" variant="destructive" type="submit">
					{m.common_delete()}
				</Button>
			</form>
		</div>
	{/snippet}

	{#if filtered.length === 0}
		<div
			class="rounded border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground"
		>
			{m.assignments_noMatches()}
		</div>
	{:else}
		<!-- #142: mobile (<sm) は table 6 列が 375px 幅で見切れるため card layout に切替。
		     desktop (>=sm) は従来 table を維持。 共通の edit/delete UI は rowActions snippet で. -->
		<ul class="space-y-2 sm:hidden" aria-label={m.assignments_list()}>
			{#each filtered as a (a.id)}
				{@const resource = resourceMap.get(a.resourceId)}
				{@const project = projectMap.get(a.projectId)}
				<li class="rounded border border-border bg-card p-3">
					<div class="mb-2 flex items-start justify-between gap-2">
						<div class="flex min-w-0 flex-col gap-0.5">
							<span class="truncate text-sm font-semibold">
								{resource?.name ?? m.assignments_deletedResource()}
							</span>
							{#if project}
								<!-- WCAG 2.5.3 (Label in Name): visible text を accessible name に含める
								     ため aria-label は付けない (上書きで project 名が読み上げされなくなる)。 -->
								<button
									type="button"
									class="inline-flex items-center gap-2 text-left text-xs hover:underline focus-visible:underline focus-visible:outline-none"
									onclick={() => openDetail(project)}
								>
									<span
										class="inline-block h-3 w-3 shrink-0 rounded-sm border border-black/10"
										style="background-color: {project.color}"
										aria-hidden="true"
									></span>
									<span class="truncate">{project.name}</span>
								</button>
							{:else}
								<span class="inline-flex items-center gap-2 text-xs">
									<span
										class="inline-block h-3 w-3 shrink-0 rounded-sm border border-black/10"
										style="background-color: #999"
										aria-hidden="true"
									></span>
									<span class="truncate">{m.assignments_deletedProject()}</span>
								</span>
							{/if}
						</div>
						{@render rowActions(a, resource, project)}
					</div>
					<dl class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs text-muted-foreground">
						<dt>{m.assignments_startDate()}</dt>
						<dd class="font-mono">{a.startDate}</dd>
						<dt>{m.assignments_endDate()}</dt>
						<dd class="font-mono">{displayEndDate(a)}</dd>
						<dt>{m.assignments_durationDays()}</dt>
						<dd class="font-mono">{duration(a)}</dd>
					</dl>
				</li>
			{/each}
		</ul>

		<div class="hidden overflow-x-auto rounded border border-border sm:block">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.assignments_resource()}</Table.Head>
						<Table.Head>{m.assignments_project()}</Table.Head>
						<Table.Head>{m.assignments_startDate()}</Table.Head>
						<Table.Head>{m.assignments_endDate()}</Table.Head>
						<Table.Head class="text-right">{m.assignments_durationDays()}</Table.Head>
						<Table.Head class="text-right">{m.common_edit()} / {m.common_delete()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filtered as a (a.id)}
						{@const resource = resourceMap.get(a.resourceId)}
						{@const project = projectMap.get(a.projectId)}
						<Table.Row>
							<Table.Cell>{resource?.name ?? m.assignments_deletedResource()}</Table.Cell>
							<Table.Cell>
								{#if project}
									<!-- WCAG 2.5.3 (Label in Name): visible text のみで accessible name 構成。 -->
									<button
										type="button"
										class="inline-flex items-center gap-2 text-left hover:underline focus-visible:underline focus-visible:outline-none"
										onclick={() => openDetail(project)}
									>
										<span
											class="inline-block h-3 w-3 shrink-0 rounded-sm border border-black/10"
											style="background-color: {project.color}"
											aria-hidden="true"
										></span>
										{project.name}
									</button>
								{:else}
									<span class="inline-flex items-center gap-2 text-muted-foreground">
										<span
											class="inline-block h-3 w-3 shrink-0 rounded-sm border border-black/10"
											style="background-color: #999"
											aria-hidden="true"
										></span>
										{m.assignments_deletedProject()}
									</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="font-mono text-xs">{a.startDate}</Table.Cell>
							<Table.Cell class="font-mono text-xs">{displayEndDate(a)}</Table.Cell>
							<Table.Cell class="text-right font-mono text-xs">{duration(a)}</Table.Cell>
							<Table.Cell class="text-right">{@render rowActions(a, resource, project)}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</main>

<AssignmentEditor bind:open={editOpen} assignment={editing} {resources} {projects} />

{#if detailProject}
	<ProjectDetailView bind:open={detailOpen} project={detailProject} />
{/if}
