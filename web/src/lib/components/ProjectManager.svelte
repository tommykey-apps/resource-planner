<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from './ui/button';
	import Dialog from './Dialog.svelte';
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

	const formSubmit: SubmitFunction = () => {
		formError = null;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				formOpen = false;
				editing = null;
			} else if (result.type === 'failure') {
				const errs = (result.data as { errors?: Record<string, string> })?.errors;
				formError = { name: errs?.name, color: errs?.color };
			}
			await update();
		};
	};

	const deleteSubmit: SubmitFunction = () => {
		return async ({ update }) => {
			await update();
		};
	};
</script>

<Button variant="outline" onclick={() => (listOpen = true)}>📁 案件を管理 ({projects.length})</Button>

<Dialog bind:open={listOpen} title="案件を管理" description="案件 (プロジェクト) の追加・編集・削除">
	<div class="flex flex-col gap-3">
		<Button onclick={startCreate}>+ 案件を追加</Button>

		{#if projects.length === 0}
			<p class="text-muted-foreground py-4 text-center text-sm">まだ案件が登録されていません。</p>
		{:else}
			<ul class="border-border divide-border divide-y border">
				{#each projects as p (p.id)}
					{@const count = assignmentCountByProject.get(p.id) ?? 0}
					<li class="flex items-center justify-between gap-2 px-3 py-2">
						<span class="flex items-center gap-2 text-sm">
							<span
								class="inline-block h-4 w-4 border border-black/10"
								style="background-color: {p.color}; border-radius: calc(var(--radius) * 0.4)"
							></span>
							{p.name}
							{#if count > 0}
								<span class="text-muted-foreground text-xs">({count} 件のアサイン)</span>
							{/if}
						</span>
						<div class="flex gap-1">
							<Button size="xs" variant="outline" onclick={() => startEdit(p)}>編集</Button>
							<form
								method="POST"
								action="?/deleteProject"
								use:enhance={deleteSubmit}
								onsubmit={(e) => {
									const msg =
										count > 0
											? `「${p.name}」と関連 ${count} 件のアサインを削除しますか?\n(取り消しできません)`
											: `「${p.name}」を削除しますか?`;
									if (!confirm(msg)) {
										e.preventDefault();
									}
								}}
							>
								<input type="hidden" name="id" value={p.id} />
								<Button size="xs" variant="destructive" type="submit">削除</Button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Dialog>

<Dialog bind:open={formOpen} title={editing ? '案件を編集' : '案件を追加'}>
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
			<span>案件名</span>
			<input
				name="name"
				type="text"
				bind:value={formName}
				required
				maxlength="100"
				autocomplete="off"
				class="border-input bg-background focus-visible:ring-ring h-9 border px-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
				style="border-radius: calc(var(--radius) * 0.6)"
			/>
			{#if formError?.name}
				<span class="text-destructive text-xs">{formError.name}</span>
			{/if}
		</label>

		<label class="flex flex-col gap-1 text-sm">
			<span>表示色</span>
			<div class="flex items-center gap-2">
				<input
					name="color"
					type="color"
					bind:value={formColor}
					class="border-input h-9 w-14 cursor-pointer border bg-transparent"
					style="border-radius: calc(var(--radius) * 0.6)"
				/>
				<span class="text-muted-foreground font-mono text-xs">{formColor}</span>
			</div>
			{#if formError?.color}
				<span class="text-destructive text-xs">{formError.color}</span>
			{/if}
		</label>

		<div class="mt-2 flex justify-end gap-2">
			<Button variant="ghost" type="button" onclick={() => (formOpen = false)}>キャンセル</Button>
			<Button type="submit">{editing ? '更新' : '追加'}</Button>
		</div>
	</form>
</Dialog>

