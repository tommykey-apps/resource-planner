<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from './ui/button';
	import { Input } from './ui/input';
	import Dialog from './Dialog.svelte';
	import { addDays } from '$lib/date';
	import { createSubmitState } from '$lib/forms/submit-state.svelte';
	import { translateServerError, type ServerErrors } from '$lib/forms/server-error';
	import { t } from '$lib/i18n/index.svelte';
	import type { Assignment, Resource, Project } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';

	/**
	 * Assignment 編集 dialog (#100 で抽出)。
	 * 呼び出し側で `open` を bindable、`assignment` を渡して trigger。
	 * 成功時に `onSuccess` が呼ばれ、呼び出し側で list の reactive 更新 / dialog close を行う。
	 */
	let {
		open = $bindable(false),
		assignment,
		resources,
		projects,
		onSuccess
	}: {
		open?: boolean;
		assignment: Assignment | null;
		resources: Resource[];
		projects: Project[];
		onSuccess?: () => void;
	} = $props();

	function displayEndDate(a: Assignment): string {
		return addDays(a.endDateExclusive, -1);
	}

	let formResourceId = $state('');
	let formProjectId = $state('');
	let formStartDate = $state('');
	let formEndDate = $state('');
	let formError = $state<{
		resourceId?: string;
		projectId?: string;
		startDate?: string;
		endDate?: string;
	} | null>(null);

	// assignment が変わるか dialog が open になるたびに form を初期化
	$effect(() => {
		if (open && assignment) {
			formResourceId = assignment.resourceId;
			formProjectId = assignment.projectId;
			formStartDate = assignment.startDate;
			formEndDate = displayEndDate(assignment);
			formError = null;
		}
	});

	const submitState = createSubmitState();
	const submit: SubmitFunction = submitState.wrap(() => {
		formError = null;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				open = false;
				onSuccess?.();
			} else if (result.type === 'failure') {
				const errs = (result.data as { errors?: ServerErrors })?.errors;
				formError = {
					resourceId: errs?.resourceId ? translateServerError(errs.resourceId) : undefined,
					projectId: errs?.projectId ? translateServerError(errs.projectId) : undefined,
					startDate: errs?.startDate ? translateServerError(errs.startDate) : undefined,
					endDate: errs?.endDate ? translateServerError(errs.endDate) : undefined
				};
			}
			await update();
		};
	});
</script>

<Dialog bind:open title={t('assignments.editTitle')} description={t('assignments.description')}>
	<form method="POST" action="/?/updateAssignment" use:enhance={submit} class="flex flex-col gap-3">
		{#if assignment}
			<input type="hidden" name="id" value={assignment.id} />
			<input type="hidden" name="prevStartDate" value={assignment.startDate} />
		{/if}

		<label class="flex flex-col gap-1 text-sm">
			<span>{t('assignments.resource')}</span>
			<select
				name="resourceId"
				aria-label={t('assignments.resource')}
				bind:value={formResourceId}
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
			<span>{t('assignments.project')}</span>
			<select
				name="projectId"
				aria-label={t('assignments.project')}
				bind:value={formProjectId}
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
				<span>{t('assignments.startDate')}</span>
				<Input name="startDate" type="date" bind:value={formStartDate} required />
				{#if formError?.startDate}
					<span class="text-xs text-destructive">{formError.startDate}</span>
				{/if}
			</label>

			<label class="flex flex-col gap-1 text-sm">
				<span>{t('assignments.endDate')}</span>
				<Input name="endDate" type="date" bind:value={formEndDate} required min={formStartDate} />
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
				disabled={submitState.submitting}
			>
				{t('common.cancel')}
			</Button>
			<Button type="submit" disabled={submitState.submitting}>
				{submitState.submitting ? t('common.submitting') : t('common.update')}
			</Button>
		</div>
	</form>
</Dialog>
