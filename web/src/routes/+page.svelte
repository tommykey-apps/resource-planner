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
	import AppHeader from '$lib/components/AppHeader.svelte';
	import EmptyStateGuide from '$lib/components/EmptyStateGuide.svelte';
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

	// #121: optimistic UI 用に resources / projects も local state へ lift。
	// load 再実行で `data.resources` が更新されたら sync (= 楽観的更新 → server confirm 後に
	// invalidate されたら server truth に rebase される)。
	let resources = $state<typeof data.resources>([]);
	$effect(() => {
		resources = data.resources;
	});
	const projects = $derived(data.projects);

	function optimisticAddResource(temp: { id: string; name: string }) {
		resources = [...resources, temp];
	}
	function confirmResourceCreate(temp: { id: string }, real: { id: string; name: string }) {
		resources = resources.map((r) => (r.id === temp.id ? real : r));
	}
	function rollbackResourceCreate(temp: { id: string }) {
		resources = resources.filter((r) => r.id !== temp.id);
		toast.error(t('resources.createFailed'));
	}
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

<AppHeader
	{resources}
	{projects}
	assignments={dbAssignments}
	user={data.user}
	onOptimisticCreateResource={optimisticAddResource}
	onConfirmCreateResource={confirmResourceCreate}
	onRollbackCreateResource={rollbackResourceCreate}
/>

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
			resourceColWidth="auto"
			labels={{
				bar: {
					resizeStart: t('timeline.barResizeStart'),
					resizeEnd: t('timeline.barResizeEnd')
				},
				canvas: { region: t('timeline.canvasRegion') },
				status: {
					move: (range) => t('timeline.statusMoved', { range }),
					resizeStart: (range) => t('timeline.statusResizeStart', { range }),
					resizeEnd: (range) => t('timeline.statusResizeEnd', { range }),
					keyMove: (range) => t('timeline.statusKeyMoved', { range }),
					keyResizeStart: (range) => t('timeline.statusKeyResizeStart', { range }),
					keyResizeEnd: (range) => t('timeline.statusKeyResizeEnd', { range })
				}
			}}
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
