<script lang="ts">
	import DepartmentOptions from '$lib/features/department/DepartmentOptions.svelte';
	import { enhance } from '$app/forms';
	import { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/shared/ui/shadcn/button';
	import { Input } from '$lib/shared/ui/shadcn/input';
	import { Textarea } from '$lib/shared/ui/shadcn/textarea';
	import Dialog from '$lib/shared/dialog/Dialog.svelte';
	import { createSubmitState } from '$lib/shared/forms/submit-state.svelte';
	import { confirmDialog } from '$lib/shared/dialog/confirm-dialog';
	import { mapServerErrors, type ServerErrors } from '$lib/shared/forms/server-error';
	import { renderMarkdown } from '$lib/features/project/markdown';
	import { m } from '$lib/shared/i18n/paraglide/messages.js';
	import { getLocale } from '$lib/shared/i18n/paraglide/runtime';
	import { nextSort, paginate, sortRows } from '$lib/shared/table/list-table';
	import { createListQuery } from '$lib/shared/table/list-query.svelte';
	import {
		flattenDepartmentTree,
		idsForDepartmentFilter,
		DEPARTMENT_FILTER_ALL,
		DEPARTMENT_FILTER_UNASSIGNED
	} from '$lib/features/department/tree';
	import {
		PROJECT_PERIODS,
		parseProjectPeriod,
		projectIdsInPeriod,
		DEFAULT_PROJECT_PERIOD,
		type ProjectPeriod
	} from '$lib/features/project/period';
	import SortHeader from '$lib/shared/table/SortHeader.svelte';
	import PageNavigation from '$lib/shared/table/PageNavigation.svelte';
	import ScrollShadow from '$lib/shared/table/ScrollShadow.svelte';
	import SelectAllHeader from '$lib/shared/table/SelectAllHeader.svelte';
	import RowSelectCell from '$lib/shared/table/RowSelectCell.svelte';
	import BulkActionBar from '$lib/shared/table/BulkActionBar.svelte';
	import { createRowSelection } from '$lib/shared/table/row-selection.svelte';
	import { makeBulkDeleteSubmit } from '$lib/shared/table/bulk-delete-submit';
	import type { Project, ProjectLink, Assignment, Department } from '@resource-planner/db/entities';
	import {
		PROJECT_DESCRIPTION_MAX_LENGTH,
		PROJECT_LINK_LABEL_MAX_LENGTH,
		PROJECT_LINK_MAX_COUNT,
		PROJECT_LINK_URL_MAX_LENGTH,
		PROJECT_NAME_MAX_LENGTH,
		PROJECT_TAGS_CSV_MAX_LENGTH
	} from '$lib/features/project/schema';
	import type { SubmitFunction } from '@sveltejs/kit';

	/**
	 * リンクの編集 UI で使う internal 型。 `_key` は `{#each}` の stable key として使う
	 * (index key は削除 / 並び替え時に DOM 破壊するため non-recommended)。
	 * server 送信時 (`linksJson`) は `_key` を除外して JSON.stringify する。
	 */
	interface EditableProjectLink extends ProjectLink {
		_key: string;
	}

	function withKey(link: ProjectLink): EditableProjectLink {
		return { ...link, _key: crypto.randomUUID() };
	}

	function stripKey({ _key: _, ...rest }: EditableProjectLink): ProjectLink {
		return rest;
	}

	let {
		projects,
		assignments,
		departments = [],
		defaultDepartmentFilter = DEPARTMENT_FILTER_ALL
	}: {
		projects: Project[];
		assignments: Assignment[];
		departments?: Department[];
		/** 部署の絞り込みの初期値 (ログインユーザーの部署、 ADR 0015 / ADR 0016)。 */
		defaultDepartmentFilter?: string;
	} = $props();

	// 部署ツリー (DFS 平坦化、 depth 付き)。 絞り込みと編集画面の選択肢に使う。
	const flatTree = $derived(flattenDepartmentTree(departments));
	const departmentName = $derived(new Map(departments.map((d) => [d.id, d.name])));
	/** 部署名 (未所属 / 不明な部署 id は「未所属」、 ResourceManager と同じ扱い)。 */
	function departmentLabel(p: Project): string {
		return (p.departmentId && departmentName.get(p.departmentId)) || m.departments_unassigned();
	}

	const PERIOD_LABEL: Record<ProjectPeriod, () => string> = {
		today: m.projects_period_today,
		month: m.projects_period_month,
		year: m.projects_period_year,
		all: m.projects_period_all
	};

	/** 各 Project に紐づく Assignment 数 (cascade delete 警告用、UC-06) */
	const assignmentCountByProject = $derived.by(() => {
		const m = new SvelteMap<string, number>();
		for (const a of assignments) {
			m.set(a.projectId, (m.get(a.projectId) ?? 0) + 1);
		}
		return m;
	});

	const DEFAULT_COLOR = '#4D72F3';

	/**
	 * 一覧の表 (DESIGN.md「一覧は表。 並び替え・絞り込み・件数・ページ送り」)。
	 * 絞り込みは案件名と使用技術の部分一致 (技術で案件を探す用途) に加え、 部署 (子孫含む) と
	 * 期間 (選んだ期間に重なる割り当てを持つ案件、 ADR 0016)。
	 */
	const SORT_KEYS = ['name', 'department', 'assignments'] as const;
	type SortKey = (typeof SORT_KEYS)[number];
	const list = createListQuery(
		SORT_KEYS,
		{ q: '', sort: 'name', dir: 'asc', page: 1 },
		['dept', 'period'],
		{
			initial: () => ({ dept: defaultDepartmentFilter, period: DEFAULT_PROJECT_PERIOD }),
			cleared: { dept: DEPARTMENT_FILTER_ALL, period: 'all' }
		}
	);
	const query = $derived(list.current);
	const deptFilter = $derived(list.filter('dept'));
	const period = $derived(parseProjectPeriod(list.filter('period')));
	const hasFilter = $derived(
		query.q !== '' ||
			(deptFilter !== '' && deptFilter !== DEPARTMENT_FILTER_ALL) ||
			period !== 'all'
	);

	const sortValue: Record<SortKey, (p: Project) => string | number> = {
		name: (p) => p.name,
		department: (p) => departmentLabel(p),
		assignments: (p) => assignmentCountByProject.get(p.id) ?? 0
	};

	const filtered = $derived.by(() => {
		const q = query.q.toLowerCase();
		const deptIds = idsForDepartmentFilter(departments, projects, deptFilter);
		const periodIds = projectIdsInPeriod(assignments, period, new Date());
		return projects.filter(
			(p) =>
				(!deptIds || deptIds.has(p.id)) &&
				(!periodIds || periodIds.has(p.id)) &&
				(!q ||
					p.name.toLowerCase().includes(q) ||
					(p.tags ?? []).some((tag) => tag.toLowerCase().includes(q)))
		);
	});
	const sorted = $derived(sortRows(filtered, sortValue[query.sort], query.dir, getLocale()));
	const paged = $derived(paginate(sorted, query.page));

	function sortBy(key: SortKey) {
		list.update({ ...nextSort(query, key), page: 1 });
	}

	const tableId = $props.id();

	/** 一括操作 (ResourceManager と同じ方針: 全選択は表示中のページだけ、 状態が変わったら解除)。 */
	const selection = createRowSelection(
		() => paged.items.map((p) => p.id),
		() => [query.q, query.sort, query.dir, query.page, deptFilter, period].join('|')
	);
	const batchMode = $derived(selection.ids.length > 0);
	const bulkDeleteSubmit = makeBulkDeleteSubmit({
		getIds: () => selection.ids,
		assignmentCountOf: (id) => assignmentCountByProject.get(id) ?? 0,
		messages: {
			confirm: (count) => m.projects_confirmBulkDelete({ count }),
			confirmWithAssignments: (count, assignments) =>
				m.projects_confirmBulkDeleteWithAssignments({ count, assignments }),
			deleted: (count) => m.projects_bulkDeleted({ count })
		},
		onDone: () => selection.clear()
	});

	let formOpen = $state(false);
	let editing = $state<Project | null>(null);
	let formName = $state('');
	let formColor = $state(DEFAULT_COLOR);
	let formDescription = $state('');
	let formTagsRaw = $state('');
	let formLinks = $state<EditableProjectLink[]>([]);
	let formDepartmentId = $state('');
	// Markdown editor の Write / Preview tab state。 default は Write (typing 開始のため)。
	let descTab = $state<'write' | 'preview'>('write');
	let formError = $state<{
		name?: string;
		color?: string;
		description?: string;
		tags?: string;
		linksJson?: string;
	} | null>(null);

	// BP B7 / APG Disclosure: 既存値ありなら details default open。 新規作成時は閉じる。
	// 初期値は form を開く時に 1 回だけ決め、 以降は bind:open で利用者の開閉を保持する。
	let detailOpen = $state(false);

	function startCreate() {
		editing = null;
		formName = '';
		formColor = DEFAULT_COLOR;
		formDescription = '';
		formTagsRaw = '';
		formLinks = [];
		// 作った案件が一覧から消えないよう、 特定の部署で絞り込み中ならその部署を初期値にする (ADR 0016)。
		formDepartmentId =
			deptFilter &&
			deptFilter !== DEPARTMENT_FILTER_ALL &&
			deptFilter !== DEPARTMENT_FILTER_UNASSIGNED
				? deptFilter
				: '';
		formError = null;
		detailOpen = false;
		formOpen = true;
	}

	function startEdit(p: Project) {
		editing = p;
		formName = p.name;
		formColor = p.color;
		formDescription = p.description ?? '';
		formTagsRaw = (p.tags ?? []).join(', ');
		formLinks = (p.links ?? []).map(withKey);
		formDepartmentId = p.departmentId ?? '';
		formError = null;
		detailOpen =
			formDescription.length > 0 || formTagsRaw.trim().length > 0 || formLinks.length > 0;
		formOpen = true;
	}

	function addLink() {
		formLinks = [...formLinks, withKey({ label: '', url: '' })];
	}

	function removeLink(index: number) {
		formLinks = formLinks.filter((_, i) => i !== index);
	}

	/**
	 * WAI-ARIA APG Tabs keyboard pattern: Arrow ← / → で tab を切替、 focus を新 tab に移す。
	 * 2 tab なので Home / End は省略 (Arrow が両方向 toggle として機能)。
	 */
	function handleTabKeydown(e: KeyboardEvent) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		descTab = descTab === 'write' ? 'preview' : 'write';
		queueMicrotask(() => {
			document.getElementById(`desc-${descTab}-tab`)?.focus();
		});
	}

	// 連打抑制 + submitting state (#94)。delete は #132 で confirm dialog が modal ブロックする。
	const formSubmitState = createSubmitState();

	const PROJECT_FORM_FIELDS = ['name', 'color', 'description', 'tags', 'linksJson'] as const;

	const formSubmit: SubmitFunction = formSubmitState.wrap(() => {
		formError = null;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				// 作ったばかりの案件は割り当てがなく、 期間で絞り込み中は一覧に出ない (ADR 0016)。
				// 作れたことはトーストで伝える。
				if (!editing) toast.success(m.projects_created({ name: formName }));
				formOpen = false;
				editing = null;
			} else if (result.type === 'failure') {
				const errs = (result.data as { errors?: ServerErrors })?.errors;
				formError = mapServerErrors(errs, PROJECT_FORM_FIELDS);
			}
			await update();
		};
	});

	/** #132: project の delete 確認 dialog (window.confirm の代替)。 */
	function makeDeleteSubmit(args: { name: string; count: number }): SubmitFunction {
		return async ({ cancel }) => {
			const msg =
				args.count > 0
					? m.projects_confirmDeleteWithAssignments({ name: args.name, count: args.count })
					: m.projects_confirmDelete({ name: args.name });
			const ok = await confirmDialog({
				title: m.common_confirm(),
				message: msg,
				confirmLabel: m.common_delete(),
				destructive: true
			});
			if (!ok) cancel();
		};
	}
</script>

<div class="flex flex-col gap-3">
	<Button class="self-start" onclick={startCreate}>{m.projects_add()}</Button>

	{#if projects.length === 0}
		<p class="py-4 text-sm text-muted-foreground">{m.projects_empty()}</p>
	{:else}
		<div class="flex flex-wrap items-end gap-3">
			<div class="flex flex-col gap-1 text-sm">
				<label for="{tableId}-q">{m.projects_filterLabel()}</label>
				<input
					id="{tableId}-q"
					type="search"
					value={query.q}
					oninput={(e) => list.update({ q: e.currentTarget.value, page: 1 })}
					class="h-9 w-56 border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					style="border-radius: calc(var(--radius) * 0.6)"
				/>
			</div>
			<div class="flex flex-col gap-1 text-sm">
				<label for="{tableId}-dept">{m.departments_field()}</label>
				<select
					id="{tableId}-dept"
					value={deptFilter}
					onchange={(e) => list.setFilter('dept', e.currentTarget.value)}
					class="h-9 border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					style="border-radius: calc(var(--radius) * 0.6)"
				>
					<option value={DEPARTMENT_FILTER_ALL}>{m.departments_allOption()}</option>
					<option value={DEPARTMENT_FILTER_UNASSIGNED}>{m.departments_unassigned()}</option>
					<DepartmentOptions tree={flatTree} />
				</select>
			</div>
			<div class="flex flex-col gap-1 text-sm">
				<label for="{tableId}-period">{m.projects_periodLabel()}</label>
				<select
					id="{tableId}-period"
					value={period}
					onchange={(e) => list.setFilter('period', e.currentTarget.value)}
					class="h-9 border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					style="border-radius: calc(var(--radius) * 0.6)"
				>
					{#each PROJECT_PERIODS as p (p)}
						<option value={p}>{PERIOD_LABEL[p]()}</option>
					{/each}
				</select>
			</div>
			<span class="pb-2 text-sm text-muted-foreground" aria-live="polite"
				>{m.common_count({ count: filtered.length })}</span
			>
			{#if hasFilter}
				<button
					type="button"
					class="cursor-pointer pb-2 text-sm underline underline-offset-4"
					onclick={() => list.clearFilters()}
				>
					{m.common_clearFilters()}
				</button>
			{/if}
		</div>

		{#if filtered.length === 0}
			<p class="py-4 text-sm text-muted-foreground">{m.projects_noMatches()}</p>
		{:else}
			<BulkActionBar count={selection.ids.length} onClear={selection.clear}>
				<form method="POST" action="?/deleteProjects" use:enhance={bulkDeleteSubmit}>
					{#each selection.ids as id (id)}
						<input type="hidden" name="ids" value={id} />
					{/each}
					<Button size="xs" variant="destructive" type="submit">{m.common_deleteSelected()}</Button>
				</form>
			</BulkActionBar>
			<ScrollShadow labelledby="{tableId}-caption">
				<table class="w-full border-collapse text-sm">
					<caption id="{tableId}-caption" class="sr-only">{m.nav_projectsLink()}</caption>
					<thead class="border-b-2 border-foreground">
						<tr>
							<SelectAllHeader state={selection.state} onToggle={selection.toggleAll} />
							<SortHeader
								label={m.projects_name()}
								active={query.sort === 'name'}
								dir={query.dir}
								onSort={() => sortBy('name')}
							/>
							<SortHeader
								label={m.departments_field()}
								active={query.sort === 'department'}
								dir={query.dir}
								onSort={() => sortBy('department')}
							/>
							<th scope="col" class="px-3 py-2 text-left font-bold">{m.projects_tagsLabel()}</th>
							<SortHeader
								label={m.common_assignmentCount()}
								active={query.sort === 'assignments'}
								dir={query.dir}
								onSort={() => sortBy('assignments')}
								align="right"
							/>
							<th scope="col" class="px-3 py-2 text-right font-bold">{m.common_actions()}</th>
						</tr>
					</thead>
					<tbody>
						{#each paged.items as p (p.id)}
							{@const count = assignmentCountByProject.get(p.id) ?? 0}
							{@const rowHeaderId = `${tableId}-row-${p.id}`}
							<tr
								class="border-b border-border align-top"
								class:bg-muted={selection.isSelected(p.id)}
							>
								<RowSelectCell
									checked={selection.isSelected(p.id)}
									labelledby={rowHeaderId}
									onToggle={() => selection.toggle(p.id)}
								/>
								<th
									id={rowHeaderId}
									scope="row"
									class="px-3 py-2 text-left font-normal whitespace-nowrap"
								>
									<span class="inline-flex items-center gap-2">
										<span
											class="inline-block h-4 w-4 shrink-0 border border-black/10"
											style="background-color: {p.color}; border-radius: calc(var(--radius) * 0.4)"
											aria-hidden="true"
										></span>
										{p.name}
									</span>
								</th>
								<td class="px-3 py-2 whitespace-nowrap">{departmentLabel(p)}</td>
								<td class="px-3 py-2">{(p.tags ?? []).join(', ')}</td>
								<td class="px-3 py-2 text-right tabular-nums">{count}</td>
								<td class="px-3 py-2">
									<div class="flex justify-end gap-1">
										<!-- Carbon: 一括操作中は行ごとの操作を無効にする -->
										<Button
											size="xs"
											variant="outline"
											disabled={batchMode}
											onclick={() => startEdit(p)}>{m.common_edit()}</Button
										>
										<form
											method="POST"
											action="?/deleteProject"
											use:enhance={makeDeleteSubmit({ name: p.name, count })}
										>
											<input type="hidden" name="id" value={p.id} />
											<Button size="xs" variant="destructive" type="submit" disabled={batchMode}>
												{m.common_delete()}
											</Button>
										</form>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</ScrollShadow>
			<PageNavigation
				page={paged.page}
				pageCount={paged.pageCount}
				hrefFor={list.hrefFor}
				label={m.nav_projectsLink()}
			/>
		{/if}
	{/if}
</div>

<Dialog bind:open={formOpen} title={editing ? m.projects_editTitle() : m.projects_createTitle()}>
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
			<span>{m.projects_name()}</span>
			<Input
				name="name"
				type="text"
				bind:value={formName}
				required
				maxlength={PROJECT_NAME_MAX_LENGTH}
				autocomplete="off"
			/>
			{#if formError?.name}
				<span class="text-xs text-destructive">{formError.name}</span>
			{/if}
		</label>

		<label class="flex flex-col gap-1 text-sm">
			<span>{m.projects_color()}</span>
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

		<label class="flex flex-col gap-1 text-sm">
			<span>{m.departments_field()}</span>
			<select
				name="departmentId"
				bind:value={formDepartmentId}
				class="h-9 border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				style="border-radius: calc(var(--radius) * 0.6)"
			>
				<option value="">{m.departments_unassigned()}</option>
				<DepartmentOptions tree={flatTree} />
			</select>
		</label>

		<!-- BP B7 (APG Disclosure): 既存値ありなら default open、 なければ closed。 -->
		<details bind:open={detailOpen} class="mt-2">
			<summary class="cursor-pointer text-sm font-medium select-none">
				{m.projects_editDetail()}
			</summary>
			<div class="mt-2 flex flex-col gap-3">
				<!--
					Markdown Write/Preview tab UI (WAI-ARIA APG Tabs pattern manual implementation)。
					- bits-ui Tabs は inactive panel を unmount するため、 form data (description) を
					  保持する用途に合わない。 panel を常時 mount で hidden 属性切替する自前実装。
					- keyboard: 2 tab の simple toggle なので Arrow ← / → で切替 (Home/End は省略)。
					- 公式 docs: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
				-->
				<div class="flex flex-col gap-1 text-sm">
					<div class="flex items-baseline justify-between gap-2">
						<span>
							{m.projects_descriptionLabel()}
							<small class="text-xs text-muted-foreground">{m.projects_descriptionHint()}</small>
						</span>
						<div
							role="tablist"
							aria-label={m.projects_descriptionTabsLabel()}
							class="inline-flex items-center gap-0 rounded border border-border bg-muted/50 p-0.5 text-xs"
						>
							{#each [{ id: 'write', label: m.projects_writeTab() }, { id: 'preview', label: m.projects_previewTab() }] as tab (tab.id)}
								<button
									type="button"
									role="tab"
									id="desc-{tab.id}-tab"
									aria-selected={descTab === tab.id}
									aria-controls="desc-{tab.id}-panel"
									tabindex={descTab === tab.id ? 0 : -1}
									class="rounded px-2 py-1 transition-colors"
									class:bg-background={descTab === tab.id}
									class:font-medium={descTab === tab.id}
									class:text-muted-foreground={descTab !== tab.id}
									onclick={() => (descTab = tab.id as 'write' | 'preview')}
									onkeydown={handleTabKeydown}
								>
									{tab.label}
								</button>
							{/each}
						</div>
					</div>

					<div
						id="desc-write-panel"
						role="tabpanel"
						aria-labelledby="desc-write-tab"
						hidden={descTab !== 'write'}
					>
						<Textarea
							name="description"
							bind:value={formDescription}
							rows={6}
							maxlength={PROJECT_DESCRIPTION_MAX_LENGTH}
						/>
					</div>

					<div
						id="desc-preview-panel"
						role="tabpanel"
						aria-labelledby="desc-preview-tab"
						hidden={descTab !== 'preview'}
						class="prose prose-sm min-h-[10rem] max-w-none rounded border border-input bg-background px-3 py-2 text-sm dark:prose-invert"
					>
						{#if formDescription.trim()}
							<!-- markdown.ts: marked + isomorphic-dompurify で sanitize 済 (server / client 共通)。 -->
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- 上記のとおり sanitize 済 -->
							{@html renderMarkdown(formDescription)}
						{:else}
							<p class="text-muted-foreground">{m.projects_previewEmpty()}</p>
						{/if}
					</div>

					{#if formError?.description}
						<span class="text-xs text-destructive">{formError.description}</span>
					{/if}
				</div>

				<label class="flex flex-col gap-1 text-sm">
					<span>{m.projects_tagsLabel()}</span>
					<Input
						id="project-tags-input"
						name="tags"
						bind:value={formTagsRaw}
						aria-describedby="project-tags-hint"
						maxlength={PROJECT_TAGS_CSV_MAX_LENGTH}
					/>
					<!-- BP B7: aria-describedby で AT に comma 区切り意図を伝える。 -->
					<p id="project-tags-hint" class="text-xs text-muted-foreground">
						{m.projects_tagsHint()}
					</p>
					{#if formError?.tags}
						<span class="text-xs text-destructive">{formError.tags}</span>
					{/if}
				</label>

				<fieldset class="flex flex-col gap-2">
					<legend class="text-sm">{m.projects_linksLabel()}</legend>
					{#each formLinks as link, i (link._key)}
						<div class="flex items-start gap-2">
							<!-- BP B7 a11y: 各 input に aria-label を付け、 行番号を伝える
							     (placeholder は accessible name の代替不可、 WAI-ARIA APG)。 -->
							<Input
								aria-label={`${m.projects_linkLabel()} ${i + 1}`}
								placeholder={m.projects_linkLabel()}
								bind:value={link.label}
								maxlength={PROJECT_LINK_LABEL_MAX_LENGTH}
								class="flex-1"
							/>
							<Input
								type="url"
								aria-label={`${m.projects_linkUrl()} ${i + 1}`}
								placeholder={m.projects_linkUrl()}
								bind:value={link.url}
								maxlength={PROJECT_LINK_URL_MAX_LENGTH}
								class="flex-1"
							/>
							<Button
								size="xs"
								variant="ghost"
								type="button"
								aria-label={`${m.projects_removeLink()} ${i + 1}`}
								onclick={() => removeLink(i)}
							>
								{m.projects_removeLink()}
							</Button>
						</div>
					{/each}
					{#if formLinks.length < PROJECT_LINK_MAX_COUNT}
						<Button size="xs" variant="outline" type="button" onclick={addLink} class="self-start">
							{m.projects_addLink()}
						</Button>
					{/if}
					{#if formError?.linksJson}
						<span class="text-xs text-destructive">{formError.linksJson}</span>
					{/if}
				</fieldset>

				<!--
					BP B8 (SvelteKit form action + nested data): 純粋 FormData では
					`name="links[0].url"` は spec 外。 hidden input に JSON.stringify した文字列で送り、
					server 側で JSON.parse → zod validate する pattern を採用 (ADR 0010、 progressive
					enhancement を捨てる trade-off を明記)。
					`_key` は UI 専用 (each key) なので stripKey で除外してから serialize する。
				-->
				<input type="hidden" name="linksJson" value={JSON.stringify(formLinks.map(stripKey))} />
			</div>
		</details>

		<div class="mt-2 flex justify-end gap-2">
			<Button
				variant="ghost"
				type="button"
				onclick={() => (formOpen = false)}
				disabled={formSubmitState.submitting}
			>
				{m.common_cancel()}
			</Button>
			<Button type="submit" disabled={formSubmitState.submitting}>
				{formSubmitState.submitting
					? m.common_submitting()
					: editing
						? m.common_update()
						: m.common_create()}
			</Button>
		</div>
	</form>
</Dialog>
