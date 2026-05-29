<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import TreeStructure from 'phosphor-svelte/lib/TreeStructure';
	import { Button } from './ui/button';
	import { Input } from './ui/input';
	import Dialog from './Dialog.svelte';
	import { createSubmitState } from '$lib/forms/submit-state.svelte';
	import { confirmDialog } from '$lib/forms/confirm-dialog';
	import { translateServerError, type ServerErrors } from '$lib/forms/server-error';
	import { t } from '$lib/i18n/index.svelte';
	import { DEPARTMENT_NAME_MAX_LENGTH } from '$lib/schemas';
	import { descendantIds, flattenDepartmentTree } from '$lib/repository/department-tree';
	import type { Department } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';

	/**
	 * 部署の管理 (ADR 0013)。 ツリー (階層 indent) 表示 + 子部署作成 (親指定) + 付け替え (move) +
	 * 削除 (#241: 配下を親へ繰り上げ)。 循環 / 兄弟名一意の最終検証は server。
	 */
	let { departments }: { departments: Department[] } = $props();

	/** DFS 平坦化 (depth 付き、 名前順、 dangling はルート扱い) — indent 表示用。 */
	const flatTree = $derived(flattenDepartmentTree(departments));

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

	let listOpen = $state(false);
	let formOpen = $state(false);
	let formName = $state('');
	/** 作成時の親 (空文字 = ルート)。 「子部署を追加」 で preset する。 */
	let formParentId = $state('');
	let formError = $state<string | null>(null);

	const formSubmitState = createSubmitState();

	function startCreateRoot() {
		formName = '';
		formParentId = '';
		formError = null;
		formOpen = true;
	}

	function startCreateChild(parent: Department) {
		formName = '';
		formParentId = parent.id;
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

<Button variant="outline" onclick={() => (listOpen = true)}>
	<TreeStructure size={18} weight="regular" aria-hidden="true" />
	<span class="hidden sm:ml-1 sm:inline"
		>{t('departments.manageWithCount', { count: departments.length })}</span
	>
</Button>

<Dialog bind:open={listOpen} title={t('departments.manage')} description={t('departments.description')}>
	<div class="flex flex-col gap-3">
		<Button onclick={startCreateRoot}>{t('departments.add')}</Button>

		{#if flatTree.length === 0}
			<p class="py-4 text-center text-sm text-muted-foreground">{t('departments.empty')}</p>
		{:else}
			<ul class="divide-y divide-border border border-border">
				{#each flatTree as { dept, depth } (dept.id)}
					<li class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
						<span style="padding-left: {depth * 16}px">{dept.name}</span>
						<div class="flex items-center gap-1">
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
							<form method="POST" action="/?/deleteDepartment" use:enhance={makeDeleteSubmit(dept)}>
								<input type="hidden" name="id" value={dept.id} />
								<Button size="xs" variant="destructive" type="submit">{t('common.delete')}</Button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Dialog>

<Dialog bind:open={formOpen} title={t('departments.createTitle')}>
	<form method="POST" action="/?/createDepartment" use:enhance={formSubmit} class="flex flex-col gap-3">
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
		<!-- 親部署 (空 = ルート)。 「子部署を追加」 から開くと preset される。 -->
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
