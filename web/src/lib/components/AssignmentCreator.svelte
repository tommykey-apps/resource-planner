<script lang="ts">
	import { enhance } from '$app/forms';
	import Plus from 'phosphor-svelte/lib/Plus';
	import { Button } from './ui/button';
	import { Input } from './ui/input';
	import Dialog from './Dialog.svelte';
	import { formatLocalDate } from '$lib/date';
	import { createSubmitState } from '$lib/forms/submit-state.svelte';
	import { mapServerErrors, type ServerErrors } from '$lib/forms/server-error';
	import { m } from '$lib/paraglide/messages.js';
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

	const ASSIGNMENT_FORM_FIELDS = ['resourceId', 'projectId', 'startDate', 'endDate'] as const;

	const formSubmit: SubmitFunction = formSubmitState.wrap(() => {
		formError = null;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				open = false;
			} else if (result.type === 'failure') {
				const errs = (result.data as { errors?: ServerErrors })?.errors;
				formError = mapServerErrors(errs, ASSIGNMENT_FORM_FIELDS);
			}
			await update();
		};
	});
</script>

<Button
	onclick={startCreate}
	disabled={!canCreate}
	title={canCreate ? '' : m.assignments_requirePeopleAndProjects()}
>
	<Plus size={18} weight="bold" aria-hidden="true" />
	<span class="ml-1">{m.assignments_add()}</span>
</Button>

<Dialog bind:open title={m.assignments_createTitle()}>
	<form
		method="POST"
		action="/?/createAssignment"
		use:enhance={formSubmit}
		class="flex flex-col gap-3"
	>
		<label class="flex flex-col gap-1 text-sm">
			<span>{m.assignments_resource()}</span>
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
			<span>{m.assignments_project()}</span>
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
				<span>{m.assignments_startDate()}</span>
				<Input name="startDate" type="date" bind:value={startDate} required />
				{#if formError?.startDate}
					<span class="text-xs text-destructive">{formError.startDate}</span>
				{/if}
			</label>

			<label class="flex flex-col gap-1 text-sm">
				<span>{m.assignments_endDate()}</span>
				<Input name="endDate" type="date" bind:value={endDate} required min={startDate} />
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
				{m.common_cancel()}
			</Button>
			<Button type="submit" disabled={formSubmitState.submitting}>
				{formSubmitState.submitting ? m.common_submitting() : m.assignments_create()}
			</Button>
		</div>
	</form>
</Dialog>
