<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from './ui/button';
	import { Input } from './ui/input';
	import Dialog from './Dialog.svelte';
	import { createSubmitState } from '$lib/forms/submit-state.svelte';
	import { confirmDialog } from '$lib/forms/confirm-dialog';
	import { translateServerError, type ServerErrors } from '$lib/forms/server-error';
	import { t } from '$lib/i18n/index.svelte';
	import { DEPARTMENT_NAME_MAX_LENGTH } from '$lib/schemas';
	import { descendantIds, flattenDepartmentTree } from '$lib/repository/department-tree';
	import ScrollShadow from './table/ScrollShadow.svelte';
	import type { Department, Resource } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';

	/**
	 * 部署の管理 (ADR 0013)。 ツリー (階層 indent) 表示 + 子部署作成 (親指定) + 改名 (#250) +
	 * 付け替え (move) + 削除 (#241: 配下を親へ繰り上げ)。 循環 / 兄弟名一意の最終検証は server。
	 */
	let {
		departments,
		resources = []
	}: {
		departments: Department[];
		/** 所属メンバー数の列に使う。 省略時は 0 人として表示する。 */
		resources?: Resource[];
	} = $props();

	/** DFS 平坦化 (depth 付き、 名前順、 dangling はルート扱い) — indent 表示用。 */
	const flatTree = $derived(flattenDepartmentTree(departments));

	/** その部署に直接所属するメンバー数 (子部署の所属は含めない)。 */
	const memberCount = $derived.by(() => {
		const m = new Map<string, number>();
		for (const r of resources) {
			if (r.departmentId) m.set(r.departmentId, (m.get(r.departmentId) ?? 0) + 1);
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
		const seen = new Set<string>([dept.id]);
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
				formError = first ? translateServerError(first) : t('errors.generic');
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
				toast.error(first ? translateServerError(first) : t('errors.generic'));
			}
			await update();
		};
	};

	/**
	 * 削除 (#241): 配下 (子部署・所属者) は **親へ繰り上がる** ので、 確認で移動先を明示する。
	 * 親があれば親名へ、 ルートなら「ルート / 未所属」へ移動する旨を出す。
	 */
	function makeDeleteSubmit(dept: Department): SubmitFunction {
		return async ({ cancel }) => {
			// 親が見つかれば親名へ、 ルート or dangling 親なら「ルート / 未所属」へ
			// (server も dangling 親はルートに正規化するので表示と挙動が一致する)。
			const parent = dept.parentId ? departments.find((d) => d.id === dept.parentId) : undefined;
			const message = parent
				? t('departments.confirmDelete', { name: dept.name, parent: parent.name })
				: t('departments.confirmDeleteRoot', { name: dept.name });
			const ok = await confirmDialog({
				title: t('common.confirm'),
				message,
				confirmLabel: t('common.delete'),
				destructive: true
			});
			if (!ok) {
				cancel();
				return;
			}
			return async ({ result, update }) => {
				if (result.type === 'failure') toast.error(t('errors.generic'));
				await update();
			};
		};
	}
</script>

<div class="flex flex-col gap-3">
	<Button class="self-start" onclick={startCreateRoot}>{t('departments.add')}</Button>

	{#if flatTree.length === 0}
		<p class="py-4 text-sm text-muted-foreground">{t('departments.empty')}</p>
	{:else}
		<!--
			ツリーなので並び替えとページ送りは付けない (並べ替えや途中での分割で親子の並びが壊れる)。
			並びは flattenDepartmentTree の DFS 順 (親 → 子、 兄弟は名前順)。
		-->
		<ScrollShadow labelledby="{tableId}-caption">
			<table class="w-full border-collapse text-sm">
				<caption id="{tableId}-caption" class="sr-only">{t('nav.departmentsLink')}</caption>
				<thead class="border-b-2 border-foreground">
					<tr>
						<th scope="col" class="px-3 py-2 text-left font-bold">{t('departments.name')}</th>
						<th scope="col" class="px-3 py-2 text-right font-bold">
							{t('departments.memberCount')}
						</th>
						<th scope="col" class="px-3 py-2 text-right font-bold">{t('common.actions')}</th>
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
										{t('common.edit')}
									</Button>
									<!-- 子部署を追加 -->
									<Button size="xs" variant="outline" onclick={() => startCreateChild(dept)}>
										{t('departments.addChild')}
									</Button>
									<!-- 付け替え (move): 親を選んだ瞬間に submit。 -->
									<form method="POST" action="/?/moveDepartment" use:enhance={moveSubmit}>
										<input type="hidden" name="id" value={dept.id} />
										<select
											name="parentId"
											aria-label={t('departments.moveAria', { name: dept.name })}
											value={dept.parentId ?? ''}
											onchange={(e) => e.currentTarget.form?.requestSubmit()}
											class="h-8 border border-input bg-background px-1 text-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
											style="border-radius: calc(var(--radius) * 0.6)"
										>
											<option value="">{t('departments.rootOption')}</option>
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
											>{t('common.delete')}</Button
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
	title={editing ? t('departments.editTitle') : t('departments.createTitle')}
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
		<!-- 親部署 (空 = ルート)。 「子部署を追加」 から開くと preset される。 改名時は出さない (付け替えは行内 select)。 -->
		{#if !editing}
			<label class="flex flex-col gap-1 text-sm">
				<span>{t('departments.parent')}</span>
				<select
					name="parentId"
					aria-label={t('departments.parent')}
					bind:value={formParentId}
					class="h-9 border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					style="border-radius: calc(var(--radius) * 0.6)"
				>
					<option value="">{t('departments.rootOption')}</option>
					{#each flatTree as { dept, depth } (dept.id)}
						<option value={dept.id}>{'\u00A0\u00A0'.repeat(depth)}{dept.name}</option>
					{/each}
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
