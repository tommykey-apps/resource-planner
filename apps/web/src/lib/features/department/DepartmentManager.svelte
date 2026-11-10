<script lang="ts">
	import DepartmentOptions from '$lib/features/department/DepartmentOptions.svelte';
	import { enhance } from '$app/forms';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/shared/ui/shadcn/button';
	import { Input } from '$lib/shared/ui/shadcn/input';
	import Dialog from '$lib/shared/dialog/Dialog.svelte';
	import { createSubmitState } from '$lib/shared/forms/submit-state.svelte';
	import { confirmDialog } from '$lib/shared/dialog/confirm-dialog';
	import { departmentDeleteMessage } from '$lib/features/department/delete-message';
	import { translateServerError, type ServerErrors } from '$lib/shared/forms/server-error';
	import { m } from '$lib/shared/i18n/paraglide/messages.js';
	import { DEPARTMENT_NAME_MAX_LENGTH } from '$lib/features/department/schema';
	import { descendantIds, flattenDepartmentTree } from '$lib/features/department/tree';
	import ScrollShadow from '$lib/shared/table/ScrollShadow.svelte';
	import type { Department, Project, Resource } from '@resource-planner/db/entities';
	import type { SubmitFunction } from '@sveltejs/kit';

	/**
	 * 部署の管理 (ADR 0013)。 ツリー (階層 indent) 表示 + 子部署作成 (親指定) + 改名 (#250) +
	 * 付け替え (move) + 削除 (#241: 配下を親へ繰り上げ)。 循環 / 兄弟名一意の最終検証は server。
	 */
	let {
		departments,
		resources = [],
		projects = []
	}: {
		departments: Department[];
		/** 所属メンバー数の列に使う。 省略時は 0 人として表示する。 */
		resources?: Resource[];
		/** 削除の確認で、 紐づく案件の件数を示すのに使う (ADR 0016)。 */
		projects?: Project[];
	} = $props();

	/** DFS 平坦化 (depth 付き、 名前順、 dangling はルート扱い) — indent 表示用。 */
	const flatTree = $derived(flattenDepartmentTree(departments));

	/** その部署に直接所属するメンバー数 (子部署の所属は含めない)。 */
	const memberCount = $derived.by(() => {
		const m = new SvelteMap<string, number>();
		for (const r of resources) {
			if (r.departmentId) m.set(r.departmentId, (m.get(r.departmentId) ?? 0) + 1);
		}
		return m;
	});

	/** その部署に直接紐づく案件数 (削除すると未所属になる件数、 ADR 0016)。 */
	const projectCount = $derived.by(() => {
		const m = new SvelteMap<string, number>();
		for (const p of projects) {
			if (p.departmentId) m.set(p.departmentId, (m.get(p.departmentId) ?? 0) + 1);
		}
		return m;
	});

	/**
	 * 親から順の祖先名。 画面上は字下げで見せる親子関係を、 支援技術には行見出しの
	 * 視覚的に隠したテキストで伝える (デジタル庁「テーブル」IndentedRows の visually-hidden に倣う)。
	 */
	const byId = $derived(new Map(departments.map((d) => [d.id, d])));
	function ancestorNames(dept: Department): string[] {
		const names: string[] = [];
		const seen = new SvelteSet<string>([dept.id]);
		let parent = dept.parentId ? byId.get(dept.parentId) : undefined;
		while (parent && !seen.has(parent.id)) {
			names.unshift(parent.name);
			seen.add(parent.id);
			parent = parent.parentId ? byId.get(parent.parentId) : undefined;
		}
		return names;
	}

	const tableId = $props.id();

	/**
	 * move の選択肢: 自分自身と子孫を除く (= 循環になる先を UI から除外。 server も検証)。
	 * 各行で呼ぶため全体は O(N^2) だが組織ツリーは小さい (ADR 0013) ので許容。
	 */
	function moveOptions(dept: Department): Department[] {
		const desc = descendantIds(departments, dept.id);
		return departments
			.filter((o) => o.id !== dept.id && !desc.has(o.id))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	let formOpen = $state(false);
	let formName = $state('');
	/** 作成時の親 (空文字 = ルート)。 「子部署を追加」 で preset する。 */
	let formParentId = $state('');
	let formError = $state<string | null>(null);
	/** 改名対象 (#250)。 null = 作成モード。 */
	let editing = $state<Department | null>(null);

	const formSubmitState = createSubmitState();

	function startCreateRoot() {
		editing = null;
		formName = '';
		formParentId = '';
		formError = null;
		formOpen = true;
	}

	function startCreateChild(parent: Department) {
		editing = null;
		formName = '';
		formParentId = parent.id;
		formError = null;
		formOpen = true;
	}

	function startEdit(dept: Department) {
		editing = dept;
		formName = dept.name;
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
				// name / parentId いずれかの最初のエラーを表示 (nameConflict / parentNotFound 等)。
				const first = errs?.name ?? errs?.parentId;
				formError = first ? translateServerError(first) : m.errors_generic();
			}
			await update();
		};
	});

	/** move (行内 select の onchange で submit)。 失敗 (nameConflict 等) は toast。 */
	const moveSubmit: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'failure') {
				const errs = (result.data as { errors?: ServerErrors })?.errors;
				const first = errs?.parentId ?? errs?.name;
				toast.error(first ? translateServerError(first) : m.errors_generic());
			}
			await update();
		};
	};

	/**
	 * 削除 (#241 / ADR 0016): 子部署と所属者は親へ繰り上がり、 直接の案件は未所属になる。
	 * 確認文の組み立ては `departmentDeleteMessage` を参照。
	 */
	function makeDeleteSubmit(dept: Department): SubmitFunction {
		return async ({ cancel }) => {
			const message = departmentDeleteMessage(dept, departments, projectCount.get(dept.id) ?? 0);
			const ok = await confirmDialog({
				title: m.common_confirm(),
				message,
				confirmLabel: m.common_delete(),
				destructive: true
			});
			if (!ok) {
				cancel();
				return;
			}
			return async ({ result, update }) => {
				if (result.type === 'failure') toast.error(m.errors_generic());
				await update();
			};
		};
	}
</script>

<div class="flex flex-col gap-3">
	<Button class="self-start" onclick={startCreateRoot}>{m.departments_add()}</Button>

	{#if flatTree.length === 0}
		<p class="py-4 text-sm text-muted-foreground">{m.departments_empty()}</p>
	{:else}
		<!--
			ツリーなので並び替えとページ送りは付けない (並べ替えや途中での分割で親子の並びが壊れる)。
			並びは flattenDepartmentTree の DFS 順 (親 → 子、 兄弟は名前順)。
		-->
		<ScrollShadow labelledby="{tableId}-caption">
			<table class="w-full border-collapse text-sm">
				<caption id="{tableId}-caption" class="sr-only">{m.nav_departmentsLink()}</caption>
				<thead class="border-b-2 border-foreground">
					<tr>
						<th scope="col" class="px-3 py-2 text-left font-bold">{m.departments_name()}</th>
						<th scope="col" class="px-3 py-2 text-right font-bold">
							{m.departments_memberCount()}
						</th>
						<th scope="col" class="px-3 py-2 text-right font-bold">{m.common_actions()}</th>
					</tr>
				</thead>
				<tbody>
					{#each flatTree as { dept, depth } (dept.id)}
						{@const ancestors = ancestorNames(dept)}
						<tr class="border-b border-border align-top">
							<th
								scope="row"
								class="py-2 pr-3 text-left font-normal whitespace-nowrap"
								style="padding-left: calc(0.75rem + {depth * 1.5}rem)"
							>
								{#if ancestors.length > 0}
									<span class="sr-only">{ancestors.join(' / ')} / </span>
								{/if}
								<span>{dept.name}</span>
							</th>
							<td class="px-3 py-2 text-right tabular-nums">{memberCount.get(dept.id) ?? 0}</td>
							<td class="px-3 py-2">
								<div class="flex justify-end gap-1">
									<Button size="xs" variant="outline" onclick={() => startEdit(dept)}>
										{m.common_edit()}
									</Button>
									<!-- 子部署を追加 -->
									<Button size="xs" variant="outline" onclick={() => startCreateChild(dept)}>
										{m.departments_addChild()}
									</Button>
									<!-- 付け替え (move): 親を選んだ瞬間に submit。 -->
									<form method="POST" action="/?/moveDepartment" use:enhance={moveSubmit}>
										<input type="hidden" name="id" value={dept.id} />
										<select
											name="parentId"
											aria-label={m.departments_moveAria({ name: dept.name })}
											value={dept.parentId ?? ''}
											onchange={(e) => e.currentTarget.form?.requestSubmit()}
											class="h-8 border border-input bg-background px-1 text-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
											style="border-radius: calc(var(--radius) * 0.6)"
										>
											<option value="">{m.departments_rootOption()}</option>
											{#each moveOptions(dept) as o (o.id)}
												<option value={o.id}>{o.name}</option>
											{/each}
										</select>
									</form>
									<!-- 削除 (#241): 配下は親へ繰り上げ。 確認 dialog は makeDeleteSubmit が出す。 -->
									<form
										method="POST"
										action="/?/deleteDepartment"
										use:enhance={makeDeleteSubmit(dept)}
									>
										<input type="hidden" name="id" value={dept.id} />
										<Button size="xs" variant="destructive" type="submit"
											>{m.common_delete()}</Button
										>
									</form>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</ScrollShadow>
	{/if}
</div>

<Dialog
	bind:open={formOpen}
	title={editing ? m.departments_editTitle() : m.departments_createTitle()}
>
	<form
		method="POST"
		action={editing ? '/?/renameDepartment' : '/?/createDepartment'}
		use:enhance={formSubmit}
		class="flex flex-col gap-3"
	>
		{#if editing}
			<input type="hidden" name="id" value={editing.id} />
		{/if}
		<label class="flex flex-col gap-1 text-sm">
			<span>{m.departments_name()}</span>
			<Input
				name="name"
				type="text"
				bind:value={formName}
				required
				maxlength={DEPARTMENT_NAME_MAX_LENGTH}
				autocomplete="off"
			/>
		</label>
		<!-- 親部署 (空 = ルート)。 「子部署を追加」 から開くと preset される。 改名時は出さない (付け替えは行内 select)。 -->
		{#if !editing}
			<label class="flex flex-col gap-1 text-sm">
				<span>{m.departments_parent()}</span>
				<select
					name="parentId"
					aria-label={m.departments_parent()}
					bind:value={formParentId}
					class="h-9 border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					style="border-radius: calc(var(--radius) * 0.6)"
				>
					<option value="">{m.departments_rootOption()}</option>
					<DepartmentOptions tree={flatTree} />
				</select>
			</label>
		{/if}
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
