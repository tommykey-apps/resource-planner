<script lang="ts">
	import { enhance } from '$app/forms';
	import Folder from 'phosphor-svelte/lib/Folder';
	import { Button } from './ui/button';
	import { Input } from './ui/input';
	import { Textarea } from './ui/textarea';
	import Dialog from './Dialog.svelte';
	import { createSubmitState } from '$lib/forms/submit-state.svelte';
	import { confirmDialog } from '$lib/forms/confirm-dialog';
	import { translateServerError, type ServerErrors } from '$lib/forms/server-error';
	import { t } from '$lib/i18n/index.svelte';
	import type { Project, ProjectLink, Assignment } from '$lib/types';
	import {
		PROJECT_DESCRIPTION_MAX_LENGTH,
		PROJECT_LINK_LABEL_MAX_LENGTH,
		PROJECT_LINK_MAX_COUNT,
		PROJECT_TAGS_CSV_MAX_LENGTH
	} from '$lib/schemas';
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
	let formDescription = $state('');
	let formTagsRaw = $state('');
	let formLinks = $state<EditableProjectLink[]>([]);
	let formError = $state<{
		name?: string;
		color?: string;
		description?: string;
		tags?: string;
		linksJson?: string;
	} | null>(null);

	// BP B7 / APG Disclosure: 既存値ありなら details default open。 新規作成時は閉じる。
	const hasDetail = $derived(
		formDescription.length > 0 || formTagsRaw.trim().length > 0 || formLinks.length > 0
	);

	function startCreate() {
		editing = null;
		formName = '';
		formColor = DEFAULT_COLOR;
		formDescription = '';
		formTagsRaw = '';
		formLinks = [];
		formError = null;
		formOpen = true;
	}

	function startEdit(p: Project) {
		editing = p;
		formName = p.name;
		formColor = p.color;
		formDescription = p.description ?? '';
		formTagsRaw = (p.tags ?? []).join(', ');
		formLinks = (p.links ?? []).map(withKey);
		formError = null;
		formOpen = true;
	}

	function addLink() {
		formLinks = [...formLinks, withKey({ label: '', url: '' })];
	}

	function removeLink(index: number) {
		formLinks = formLinks.filter((_, i) => i !== index);
	}

	// 連打抑制 + submitting state (#94)。delete は #132 で confirm dialog が modal ブロックする。
	const formSubmitState = createSubmitState();

	const formSubmit: SubmitFunction = formSubmitState.wrap(() => {
		formError = null;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				formOpen = false;
				editing = null;
			} else if (result.type === 'failure') {
				const errs = (result.data as { errors?: ServerErrors })?.errors;
				formError = {
					name: errs?.name ? translateServerError(errs.name) : undefined,
					color: errs?.color ? translateServerError(errs.color) : undefined,
					description: errs?.description ? translateServerError(errs.description) : undefined,
					tags: errs?.tags ? translateServerError(errs.tags) : undefined,
					linksJson: errs?.linksJson ? translateServerError(errs.linksJson) : undefined
				};
			}
			await update();
		};
	});

	/** #132: project の delete 確認 dialog (window.confirm の代替)。 */
	function makeDeleteSubmit(args: { name: string; count: number }): SubmitFunction {
		return async ({ cancel }) => {
			const msg =
				args.count > 0
					? t('projects.confirmDeleteWithAssignments', { name: args.name, count: args.count })
					: t('projects.confirmDelete', { name: args.name });
			const ok = await confirmDialog({
				title: t('common.confirm'),
				message: msg,
				confirmLabel: t('common.delete'),
				destructive: true
			});
			if (!ok) cancel();
		};
	}
</script>

<Button variant="outline" onclick={() => (listOpen = true)}>
	<Folder size={18} weight="regular" aria-hidden="true" />
	<span class="hidden sm:ml-1 sm:inline"
		>{t('projects.manageWithCount', { count: projects.length })}</span
	>
</Button>

<Dialog bind:open={listOpen} title={t('projects.manage')} description={t('projects.description')}>
	<div class="flex flex-col gap-3">
		<Button onclick={startCreate}>{t('projects.add')}</Button>

		{#if projects.length === 0}
			<p class="py-4 text-center text-sm text-muted-foreground">{t('projects.empty')}</p>
		{:else}
			<ul class="divide-y divide-border border border-border">
				{#each projects as p (p.id)}
					{@const count = assignmentCountByProject.get(p.id) ?? 0}
					<li class="flex items-center justify-between gap-2 px-3 py-2">
						<span class="flex items-center gap-2 text-sm">
							<span
								class="inline-block h-4 w-4 border border-black/10"
								style="background-color: {p.color}; border-radius: calc(var(--radius) * 0.4)"
								aria-hidden="true"
							></span>
							{p.name}
							<span class="text-xs text-muted-foreground"
								>{t('projects.assignmentCount', { count })}</span
							>
						</span>
						<div class="flex gap-1">
							<Button size="xs" variant="outline" onclick={() => startEdit(p)}
								>{t('common.edit')}</Button
							>
							<form
								method="POST"
								action="?/deleteProject"
								use:enhance={makeDeleteSubmit({ name: p.name, count })}
							>
								<input type="hidden" name="id" value={p.id} />
								<Button size="xs" variant="destructive" type="submit">
									{t('common.delete')}
								</Button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Dialog>

<Dialog bind:open={formOpen} title={editing ? t('projects.editTitle') : t('projects.createTitle')}>
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
			<span>{t('projects.name')}</span>
			<Input
				name="name"
				type="text"
				bind:value={formName}
				required
				maxlength={100}
				autocomplete="off"
			/>
			{#if formError?.name}
				<span class="text-xs text-destructive">{formError.name}</span>
			{/if}
		</label>

		<label class="flex flex-col gap-1 text-sm">
			<span>{t('projects.color')}</span>
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

		<!-- BP B7 (APG Disclosure): 既存値ありなら default open、 なければ closed。 -->
		<details open={hasDetail} class="mt-2">
			<summary class="cursor-pointer select-none text-sm font-medium">
				{t('projects.editDetail')}
			</summary>
			<div class="mt-2 flex flex-col gap-3">
				<label class="flex flex-col gap-1 text-sm">
					<span>
						{t('projects.descriptionLabel')}
						<small class="text-muted-foreground text-xs">{t('projects.descriptionHint')}</small>
					</span>
					<Textarea
						name="description"
						bind:value={formDescription}
						rows={6}
						maxlength={PROJECT_DESCRIPTION_MAX_LENGTH}
					/>
					{#if formError?.description}
						<span class="text-xs text-destructive">{formError.description}</span>
					{/if}
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span>{t('projects.tagsLabel')}</span>
					<Input
						id="project-tags-input"
						name="tags"
						bind:value={formTagsRaw}
						aria-describedby="project-tags-hint"
						maxlength={PROJECT_TAGS_CSV_MAX_LENGTH}
					/>
					<!-- BP B7: aria-describedby で AT に comma 区切り意図を伝える。 -->
					<p id="project-tags-hint" class="text-xs text-muted-foreground">
						{t('projects.tagsHint')}
					</p>
					{#if formError?.tags}
						<span class="text-xs text-destructive">{formError.tags}</span>
					{/if}
				</label>

				<fieldset class="flex flex-col gap-2">
					<legend class="text-sm">{t('projects.linksLabel')}</legend>
					{#each formLinks as link, i (link._key)}
						<div class="flex items-start gap-2">
							<!-- BP B7 a11y: 各 input に aria-label を付け、 行番号を伝える
							     (placeholder は accessible name の代替不可、 WAI-ARIA APG)。 -->
							<Input
								aria-label={`${t('projects.linkLabel')} ${i + 1}`}
								placeholder={t('projects.linkLabel')}
								bind:value={link.label}
								maxlength={PROJECT_LINK_LABEL_MAX_LENGTH}
								class="flex-1"
							/>
							<Input
								type="url"
								aria-label={`${t('projects.linkUrl')} ${i + 1}`}
								placeholder={t('projects.linkUrl')}
								bind:value={link.url}
								class="flex-1"
							/>
							<Button
								size="xs"
								variant="ghost"
								type="button"
								onclick={() => removeLink(i)}
							>
								{t('projects.removeLink')}
							</Button>
						</div>
					{/each}
					{#if formLinks.length < PROJECT_LINK_MAX_COUNT}
						<Button
							size="xs"
							variant="outline"
							type="button"
							onclick={addLink}
							class="self-start"
						>
							{t('projects.addLink')}
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
