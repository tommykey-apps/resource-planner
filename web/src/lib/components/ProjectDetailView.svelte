<script lang="ts">
	import Dialog from './Dialog.svelte';
	import ArrowSquareOut from 'phosphor-svelte/lib/ArrowSquareOut';
	import { t } from '$lib/i18n/index.svelte';
	import type { ProjectWithRenderedDescription } from '$lib/types';

	let {
		project,
		open = $bindable(false)
	}: {
		project: ProjectWithRenderedDescription;
		open?: boolean;
	} = $props();
</script>

<Dialog bind:open title={t('projects.detailTitle', { name: project.name })}>
	{#if project.descriptionHtml}
		<section class="mb-4">
			<h3 class="mb-2 text-sm font-semibold">{t('projects.descriptionLabel')}</h3>
			<!--
				descriptionHtml は `+layout.server.ts` で `renderMarkdown()` を通って sanitize 済
				(ADR 0010 / PR-N2)。 client 側は表示のみ、 ここで生 markdown を render し直すと
				二重 sanitize で過剰 strip になる可能性があるため使わない。
			-->
			<div class="prose prose-sm max-w-none dark:prose-invert">
				{@html project.descriptionHtml}
			</div>
		</section>
	{/if}

	{#if project.tags?.length}
		<section class="mb-4">
			<h3 class="mb-2 text-sm font-semibold">{t('projects.tagsLabel')}</h3>
			<ul class="flex flex-wrap gap-2">
				{#each project.tags as tag (tag)}
					<li
						class="rounded bg-muted px-2 py-1 text-xs"
						style="border-radius: calc(var(--radius) * 0.6)"
					>
						{tag}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if project.links?.length}
		<section>
			<h3 class="mb-2 text-sm font-semibold">{t('projects.linksLabel')}</h3>
			<ul class="flex flex-col gap-1 text-sm">
				{#each project.links as link (link.url)}
					<li>
						<!--
							BP B7 a11y: target=_blank には rel="noopener noreferrer" を必ず付ける
							(tabnabbing / Performance 対策、 OWASP)。 sr-only で「新規 tab で開く」 を
							AT に伝え、 視覚的には phosphor の ArrowSquareOut icon で外部リンクを示す。
						-->
						<a
							href={link.url}
							target="_blank"
							rel="noopener noreferrer"
							class="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
						>
							{link.label || link.url}
							<ArrowSquareOut size={14} aria-hidden="true" />
							<span class="sr-only"> ({t('common.opensInNewTab')})</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</Dialog>
