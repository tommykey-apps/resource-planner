<script lang="ts">
	import {
		ResourceTimeline,
		TimelineToolbar,
		ZOOMS,
		type Assignment as TimelineAssignment
	} from '@tommykey-apps/ui-components';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { toTimelineAssignment, fromTimelineAssignment } from '$lib/timeline-adapter';
	import { applyTimelineParams, parseTimelineParams } from '$lib/timeline-url-state';
	import ResourceManager from '$lib/components/ResourceManager.svelte';
	import ProjectManager from '$lib/components/ProjectManager.svelte';
	import AssignmentCreator from '$lib/components/AssignmentCreator.svelte';
	import { Button } from '$lib/components/ui/button';
	import ListChecks from 'phosphor-svelte/lib/ListChecks';
	import EmptyStateGuide from '$lib/components/EmptyStateGuide.svelte';
	import AvatarDropdown from '$lib/components/AvatarDropdown.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LocaleSwitcher from '$lib/components/LocaleSwitcher.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import type { Assignment as DbAssignment } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// DB 形式のアサインを source of truth として保持。
	// timeline 形式 (end-exclusive Date) は $derived で都度 compose する。
	// data.assignments は load 再実行 (invalidateAll 後など) で更新されるため $effect で再同期。
	let dbAssignments = $state<DbAssignment[]>([]);
	$effect(() => {
		dbAssignments = data.assignments;
	});

	const resources = $derived(data.resources);
	const projects = $derived(data.projects);
	const projectMap = $derived(new Map(projects.map((p) => [p.id, p])));

	const timelineAssignments = $derived(
		dbAssignments.map((a) => toTimelineAssignment(a, projectMap.get(a.projectId)))
	);

	// #99 item 2: viewport / zoom を URL `?d=YYYY-MM-DD&z=day|week|month|year` と双方向同期。
	// 初期値は URL から復元、無ければ今日 + day zoom。
	// $effect は URL を直接読まないことで goto → URL 変化 → effect 再実行のループを避ける
	// (代わりに window.location.href と比較して差分のときだけ goto)。
	const initialUrlState = parseTimelineParams(page.url.searchParams);
	let viewportStart = $state(initialUrlState.viewportStart ?? new Date());
	let zoom = $state(initialUrlState.zoom ?? ZOOMS.day);

	$effect(() => {
		if (typeof window === 'undefined') return;
		const next = applyTimelineParams(new URL(window.location.href), { viewportStart, zoom });
		if (next.toString() !== window.location.href) {
			goto(next, { replaceState: true, noScroll: true, keepFocus: true });
		}
	});

	/**
	 * UC-04 ドラッグ移動 / リサイズ。
	 *
	 * Optimistic UI パターン (ADR 0005):
	 * 1. 旧 state を snapshot
	 * 2. local state を即時更新 (帯が新位置に移動)
	 * 3. PATCH /api/assignments/[id] に永続化リクエスト
	 * 4. 失敗したら snapshot に revert + toast 表示
	 */
	async function handleUpdate(updated: TimelineAssignment) {
		const prev = dbAssignments.find((a) => a.id === updated.id);
		if (!prev) return;
		const next = fromTimelineAssignment(updated, prev);

		const snapshot = dbAssignments;
		dbAssignments = dbAssignments.map((a) => (a.id === next.id ? next : a));

		try {
			const res = await fetch(`/api/assignments/${next.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prevStartDate: prev.startDate,
					resourceId: next.resourceId,
					projectId: next.projectId,
					startDate: next.startDate,
					endDateExclusive: next.endDateExclusive
				})
			});
			if (!res.ok) {
				throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
			}
		} catch (e) {
			dbAssignments = snapshot;
			toast.error(t('assignments.updateError'), {
				description: e instanceof Error ? e.message : t('assignments.networkError')
			});
		}
	}
</script>

<header class="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
	<div class="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 px-4 py-3">
		<h1 class="m-0 text-lg font-semibold tracking-tight sm:text-xl">{t('app.title')}</h1>
		<div class="flex flex-wrap items-center gap-2">
			<ResourceManager {resources} assignments={dbAssignments} />
			<ProjectManager {projects} assignments={dbAssignments} />
			<AssignmentCreator {resources} {projects} />
			<Button variant="outline" href="/assignments">
				<ListChecks size={18} weight="regular" aria-hidden="true" />
				<span class="hidden sm:ml-1 sm:inline"
					>{t('assignments.listWithCount', { count: dbAssignments.length })}</span
				>
			</Button>
			<LocaleSwitcher />
			<ThemeToggle />
			<AvatarDropdown email={data.user?.email ?? ''} />
		</div>
	</div>
</header>

<main class="mx-auto max-w-[1200px] px-4 py-6">
	<EmptyStateGuide
		resourceCount={resources.length}
		projectCount={projects.length}
		assignmentCount={dbAssignments.length}
	/>

	{#if resources.length === 0}
		<div class="empty-state">
			<p>{t('resources.emptyHint')}</p>
		</div>
	{:else}
		<TimelineToolbar
			bind:viewportStart
			bind:zoom
			labels={{
				today: t('timeline.today'),
				prev: t('timeline.prev'),
				next: t('timeline.next'),
				zoomDay: t('timeline.zoomDay'),
				zoomWeek: t('timeline.zoomWeek'),
				zoomMonth: t('timeline.zoomMonth'),
				zoomYear: t('timeline.zoomYear')
			}}
			ariaLabels={{ prev: t('timeline.prevAria'), next: t('timeline.nextAria') }}
		/>

		<ResourceTimeline
			{resources}
			assignments={timelineAssignments}
			bind:viewportStart
			{zoom}
			onMove={handleUpdate}
			onResize={handleUpdate}
		/>
	{/if}
</main>

<style>
	main {
		font-family: system-ui, sans-serif;
	}

	.empty-state {
		padding: 4rem 1rem;
		text-align: center;
		color: var(--muted-foreground);
	}

	.empty-state p {
		margin: 0;
	}

	.empty-state .hint {
		margin-top: 0.25rem;
		font-size: 0.875rem;
	}

	main :global(.toolbar) {
		margin-bottom: 1rem;
	}
</style>
