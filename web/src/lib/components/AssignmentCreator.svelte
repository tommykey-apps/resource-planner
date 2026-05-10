<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from './ui/button';
	import Dialog from './Dialog.svelte';
	import { formatLocalDate } from '$lib/timeline-adapter';
	import { createSubmitState } from '$lib/forms/submit-state.svelte';
	import type { Resource, Project } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';

	let {
		resources,
		projects
	}: {
		resources: Resource[];
		projects: Project[];
	} = $props();

	const today = formatLocalDate(new Date());
	const oneWeekLater = (() => {
		const d = new Date();
		d.setDate(d.getDate() + 6);
		return formatLocalDate(d);
	})();

	let open = $state(false);
	let resourceId = $state('');
	let projectId = $state('');
	let startDate = $state(today);
	let endDate = $state(oneWeekLater);
	let formError = $state<{
		resourceId?: string;
		projectId?: string;
		startDate?: string;
		endDate?: string;
	} | null>(null);

	const canCreate = $derived(resources.length > 0 && projects.length > 0);

	function startCreate() {
		// デフォルトの選択肢: 最初の resource / project
		resourceId = resources[0]?.id ?? '';
		projectId = projects[0]?.id ?? '';
		startDate = today;
		endDate = oneWeekLater;
		formError = null;
		open = true;
	}

	// 連打抑制 + submitting state (#94)
	const formSubmitState = createSubmitState();

	const formSubmit: SubmitFunction = formSubmitState.wrap(() => {
		formError = null;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				open = false;
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

<Button
	onclick={startCreate}
	disabled={!canCreate}
	title={canCreate ? '' : '人と案件を 1 件以上登録してから作成できます'}
>
	+ アサインを追加
</Button>

<Dialog bind:open title="アサインを追加" description="人を案件に期間でアサインする">
	<form
		method="POST"
		action="?/createAssignment"
		use:enhance={formSubmit}
		class="flex flex-col gap-3"
	>
		<label class="flex flex-col gap-1 text-sm">
			<span>人</span>
			<select
				name="resourceId"
				bind:value={resourceId}
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
			<span>案件</span>
			<select
				name="projectId"
				bind:value={projectId}
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
				<span>開始日</span>
				<input
					name="startDate"
					type="date"
					bind:value={startDate}
					required
					class="h-9 border border-input bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					style="border-radius: calc(var(--radius) * 0.6)"
				/>
				{#if formError?.startDate}
					<span class="text-xs text-destructive">{formError.startDate}</span>
				{/if}
			</label>

			<label class="flex flex-col gap-1 text-sm">
				<span>終了日 (含む)</span>
				<input
					name="endDate"
					type="date"
					bind:value={endDate}
					required
					min={startDate}
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
				onclick={() => (open = false)}
				disabled={formSubmitState.submitting}
			>
				キャンセル
			</Button>
			<Button type="submit" disabled={formSubmitState.submitting}>
				{formSubmitState.submitting ? '送信中...' : '作成'}
			</Button>
		</div>
	</form>
</Dialog>
