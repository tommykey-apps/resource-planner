<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from './ui/button';
	import { Input } from './ui/input';
	import Dialog from './Dialog.svelte';
	import { createSubmitState } from '$lib/forms/submit-state.svelte';
	import { confirmDialog } from '$lib/forms/confirm-dialog';
	import { translateServerError, type ServerErrors } from '$lib/forms/server-error';
	import { rollbackRecoverState } from '$lib/forms/optimistic-rollback';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime';
	import {
		flattenDepartmentTree,
		resourceIdsForDepartmentFilter,
		DEPARTMENT_FILTER_UNASSIGNED
	} from '$lib/repository/department-tree';
	import { nextSort, paginate, sortRows } from '$lib/list-table';
	import { createListQuery } from '$lib/state/list-query.svelte';
	import SortHeader from './table/SortHeader.svelte';
	import PageNavigation from './table/PageNavigation.svelte';
	import ScrollShadow from './table/ScrollShadow.svelte';
	import SelectAllHeader from './table/SelectAllHeader.svelte';
	import RowSelectCell from './table/RowSelectCell.svelte';
	import BulkActionBar from './table/BulkActionBar.svelte';
	import { createRowSelection } from '$lib/state/row-selection.svelte';
	import { makeBulkDeleteSubmit } from '$lib/forms/bulk-delete-submit';
	import type { Resource, Assignment, Department } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';

	let {
		resources,
		assignments,
		departments = [],
		onOptimisticCreate,
		onConfirmCreate,
		onRollbackCreate
	}: {
		resources: Resource[];
		assignments: Assignment[];
		/** #239: 所属部署の選択肢 + グルーピング表示用。 省略時は未所属のみ。 */
		departments?: Department[];
		/** #121 optimistic UI hooks。create 時に temp → server entity の swap を親で行う。 */
		onOptimisticCreate?: (temp: Resource) => void;
		onConfirmCreate?: (temp: Resource, real: Resource) => void;
		onRollbackCreate?: (temp: Resource) => void;
	} = $props();

	// #239/#240: 部署ツリー (DFS 平坦化、 depth 付き)。 select の選択肢 + グループ見出しの両方に使う。
	const flatTree = $derived(flattenDepartmentTree(departments));

	/** 各 Resource に紐づく Assignment 数 (cascade delete 時の警告で使う、UC-06) */
	const assignmentCountByResource = $derived.by(() => {
		const m = new Map<string, number>();
		for (const a of assignments) {
			m.set(a.resourceId, (m.get(a.resourceId) ?? 0) + 1);
		}
		return m;
	});

	const departmentName = $derived(new Map(departments.map((d) => [d.id, d.name])));
	/** 部署名 (未所属 / 不明な部署 id は「未所属」)。 #239: dangling も未所属として扱う。 */
	function departmentLabel(r: Resource): string {
		return (r.departmentId && departmentName.get(r.departmentId)) || m.departments_unassigned();
	}

	/**
	 * 一覧の表 (DESIGN.md「一覧は表。 並び替え・絞り込み・件数・ページ送り」)。
	 * 1行1メンバーにし、 部署はグループ見出しではなく列にする
	 * (デジタル庁「テーブル」アクセシビリティ: グループ行を挟まず 1行1レコード)。
	 */
	const SORT_KEYS = ['name', 'department', 'assignments'] as const;
	type SortKey = (typeof SORT_KEYS)[number];
	const list = createListQuery(SORT_KEYS, { q: '', sort: 'name', dir: 'asc', page: 1 }, ['dept']);
	const query = $derived(list.current);
	const deptFilter = $derived(list.filter('dept'));
	const hasFilter = $derived(query.q !== '' || deptFilter !== '');

	const sortValue: Record<SortKey, (r: Resource) => string | number> = {
		name: (r) => r.name,
		department: (r) => departmentLabel(r),
		assignments: (r) => assignmentCountByResource.get(r.id) ?? 0
	};

	const filtered = $derived.by(() => {
		const q = query.q.toLowerCase();
		const deptIds = resourceIdsForDepartmentFilter(departments, resources, deptFilter);
		return resources.filter(
			(r) => (!q || r.name.toLowerCase().includes(q)) && (!deptIds || deptIds.has(r.id))
		);
	});
	const sorted = $derived(sortRows(filtered, sortValue[query.sort], query.dir, getLocale()));
	const paged = $derived(paginate(sorted, query.page));

	function sortBy(key: SortKey) {
		list.update({ ...nextSort(query, key), page: 1 });
	}

	const tableId = $props.id();

	/**
	 * 一括操作 (デジタル庁「テーブル」行の選択 + Carbon Data table batch actions)。
	 * 全選択の対象は表示中のページの行だけ。 絞り込み・並び替え・ページが変わったら選択を解除する。
	 */
	const selection = createRowSelection(
		() => paged.items.map((r) => r.id),
		() => [query.q, query.sort, query.dir, query.page, deptFilter].join('|')
	);
	const batchMode = $derived(selection.ids.length > 0);
	let bulkDepartmentId = $state('');

	const bulkDeleteSubmit = makeBulkDeleteSubmit({
		getIds: () => selection.ids,
		assignmentCountOf: (id) => assignmentCountByResource.get(id) ?? 0,
		messages: {
			confirm: (count) => m.resources_confirmBulkDelete({ count }),
			confirmWithAssignments: (count, assignments) =>
				m.resources_confirmBulkDeleteWithAssignments({ count, assignments }),
			deleted: (count) => m.resources_bulkDeleted({ count })
		},
		onDone: () => selection.clear()
	});

	const bulkMoveSubmit: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				const moved = (result.data as { moved?: number })?.moved ?? 0;
				toast.success(m.resources_bulkMoved({ count: moved }));
			} else {
				toast.error(m.resources_bulkMoveFailed());
			}
			selection.clear();
			await update();
		};
	};

	let formOpen = $state(false);
	let editing = $state<Resource | null>(null);
	let formName = $state('');
	/** #239: 所属部署 (空文字 = 未所属)。 */
	let formDepartmentId = $state('');
	let formError = $state<string | null>(null);

	// 連打抑制 + submitting state (#94)。create / update form 用 (delete は #132 で confirm dialog が modal ブロックするため不要)。
	const formSubmitState = createSubmitState();

	function startCreate() {
		editing = null;
		formName = '';
		formDepartmentId = '';
		formError = null;
		formOpen = true;
	}

	function startEdit(r: Resource) {
		editing = r;
		formName = r.name;
		formDepartmentId = r.departmentId ?? '';
		formError = null;
		formOpen = true;
	}

	/**
	 * Optimistic UI for create (#121 + #140):
	 * - submit 前に temp ID 付きの Resource を親 state に即時追加 (dialog も即時 close)
	 * - server success → 親で temp → real swap、`update()` は不要 (refetch 回避)
	 * - server failure → 親で temp 削除 + 親側で toast、
	 *   **加えて dialog を再 open + 入力値を formName に復元 + server error を formError に**
	 *   (#140: 旧設計は入力破棄で UX 退行していた、 #155 / #157 と整合する形で復元)
	 * Update path (editing 時) は従来通り `update()` で invalidateAll、後続 PR で同 pattern 化候補。
	 */
	let pendingTemp: Resource | null = null;

	const formSubmit: SubmitFunction = formSubmitState.wrap(({ formData }) => {
		formError = null;
		const isCreate = !editing && !!onOptimisticCreate;
		if (isCreate) {
			const name = (formData.get('name') ?? '').toString().trim();
			if (name.length > 0) {
				// #239: 楽観追加でも所属部署を持たせて正しいグループに即時表示する。
				const departmentId = (formData.get('departmentId') ?? '').toString().trim() || undefined;
				pendingTemp = {
					id: `temp-${crypto.randomUUID()}`,
					name,
					...(departmentId ? { departmentId } : {})
				};
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
					// #140: rollback だけでなく form を復活させてユーザーが再入力せずに済むようにする
					if (onRollbackCreate) onRollbackCreate(tempSnapshot);
					const recovered = rollbackRecoverState({
						temp: tempSnapshot,
						failureData:
							result.type === 'failure' ? (result.data as { errors?: ServerErrors }) : undefined,
						translate: translateServerError,
						fallback: m.errors_generic(),
						field: 'name'
					});
					formName = recovered.formName;
					formError = recovered.formError;
					// #239: 選択した部署も復元する (rollbackRecoverState は name のみ対象のため別途)。
					formDepartmentId = tempSnapshot.departmentId ?? '';
					formOpen = true;
				}
				return; // optimistic は update() 不要
			}
			if (result.type === 'success') {
				formOpen = false;
				editing = null;
			} else if (result.type === 'failure') {
				const errs = (result.data as { errors?: ServerErrors })?.errors;
				formError = errs?.name ? translateServerError(errs.name) : m.errors_generic();
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
					? m.resources_confirmDeleteWithAssignments({ name: args.name, count: args.count })
					: m.resources_confirmDelete({ name: args.name });
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
	<Button class="self-start" onclick={startCreate}>{m.resources_add()}</Button>

	{#if resources.length === 0}
		<p class="py-4 text-sm text-muted-foreground">{m.resources_empty()}</p>
	{:else}
		<div class="flex flex-wrap items-end gap-3">
			<div class="flex flex-col gap-1 text-sm">
				<label for="{tableId}-q">{m.common_filterByName()}</label>
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
					<option value="">{m.departments_allOption()}</option>
					<option value={DEPARTMENT_FILTER_UNASSIGNED}>{m.departments_unassigned()}</option>
					{#each flatTree as { dept, depth } (dept.id)}
						<option value={dept.id}>{'\u00A0\u00A0'.repeat(depth)}{dept.name}</option>
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
			<p class="py-4 text-sm text-muted-foreground">{m.resources_noMatches()}</p>
		{:else}
			<BulkActionBar count={selection.ids.length} onClear={selection.clear}>
				<form
					method="POST"
					action="/?/moveResources"
					use:enhance={bulkMoveSubmit}
					class="flex items-center gap-2"
				>
					{#each selection.ids as id (id)}
						<input type="hidden" name="ids" value={id} />
					{/each}
					<label for="{tableId}-bulk-dept">{m.resources_moveSelected()}</label>
					<select
						id="{tableId}-bulk-dept"
						name="departmentId"
						bind:value={bulkDepartmentId}
						class="h-8 border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						style="border-radius: calc(var(--radius) * 0.6)"
					>
						<option value="">{m.departments_unassigned()}</option>
						{#each flatTree as { dept, depth } (dept.id)}
							<option value={dept.id}>{'\u00A0\u00A0'.repeat(depth)}{dept.name}</option>
						{/each}
					</select>
					<Button size="xs" variant="outline" type="submit">{m.common_change()}</Button>
				</form>
				<form method="POST" action="/?/deleteResources" use:enhance={bulkDeleteSubmit}>
					{#each selection.ids as id (id)}
						<input type="hidden" name="ids" value={id} />
					{/each}
					<Button size="xs" variant="destructive" type="submit">{m.common_deleteSelected()}</Button>
				</form>
			</BulkActionBar>
			<ScrollShadow labelledby="{tableId}-caption">
				<table class="w-full border-collapse text-sm">
					<caption id="{tableId}-caption" class="sr-only">{m.nav_resourcesLink()}</caption>
					<thead class="border-b-2 border-foreground">
						<tr>
							<SelectAllHeader state={selection.state} onToggle={selection.toggleAll} />
							<SortHeader
								label={m.resources_name()}
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
						{#each paged.items as r (r.id)}
							{@const count = assignmentCountByResource.get(r.id) ?? 0}
							{@const rowHeaderId = `${tableId}-row-${r.id}`}
							<tr
								class="border-b border-border align-top"
								class:bg-muted={selection.isSelected(r.id)}
							>
								<RowSelectCell
									checked={selection.isSelected(r.id)}
									labelledby={rowHeaderId}
									onToggle={() => selection.toggle(r.id)}
								/>
								<th
									id={rowHeaderId}
									scope="row"
									class="px-3 py-2 text-left font-normal whitespace-nowrap"
								>
									{r.name}
								</th>
								<td class="px-3 py-2 whitespace-nowrap">{departmentLabel(r)}</td>
								<td class="px-3 py-2 text-right tabular-nums">{count}</td>
								<td class="px-3 py-2">
									<div class="flex justify-end gap-1">
										<!-- Carbon: 一括操作中は行ごとの操作を無効にする -->
										<Button
											size="xs"
											variant="outline"
											disabled={batchMode}
											onclick={() => startEdit(r)}>{m.common_edit()}</Button
										>
										<form
											method="POST"
											action="/?/deleteResource"
											use:enhance={makeDeleteSubmit({ name: r.name, count })}
										>
											<input type="hidden" name="id" value={r.id} />
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
				label={m.nav_resourcesLink()}
			/>
		{/if}
	{/if}
</div>

<Dialog bind:open={formOpen} title={editing ? m.resources_editTitle() : m.resources_createTitle()}>
	<form
		method="POST"
		action={editing ? '/?/updateResource' : '/?/createResource'}
		use:enhance={formSubmit}
		class="flex flex-col gap-3"
	>
		{#if editing}
			<input type="hidden" name="id" value={editing.id} />
		{/if}
		<label class="flex flex-col gap-1 text-sm">
			<span>{m.resources_name()}</span>
			<Input
				name="name"
				type="text"
				bind:value={formName}
				required
				maxlength={100}
				autocomplete="off"
			/>
		</label>
		<!-- #239: 所属部署 (空 = 未所属)。 ツリー indent 付き選択は #240。 -->
		<label class="flex flex-col gap-1 text-sm">
			<span>{m.departments_field()}</span>
			<select
				name="departmentId"
				aria-label={m.departments_field()}
				bind:value={formDepartmentId}
				class="h-9 border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				style="border-radius: calc(var(--radius) * 0.6)"
			>
				<option value="">{m.departments_unassigned()}</option>
				{#each flatTree as { dept, depth } (dept.id)}
					<option value={dept.id}>{'\u00A0\u00A0'.repeat(depth)}{dept.name}</option>
				{/each}
			</select>
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
