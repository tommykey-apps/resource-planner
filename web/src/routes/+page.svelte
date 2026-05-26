<script lang="ts">
	import {
		ResourceTimeline,
		TimelineToolbar,
		ZOOMS,
		type Assignment as TimelineAssignment
	} from '@tommykey-apps/ui-components';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { toTimelineAssignment, fromTimelineAssignment } from '$lib/timeline-adapter';
	import { applyTimelineParams, parseTimelineParams } from '$lib/timeline-url-state';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import EmptyStateGuide from '$lib/components/EmptyStateGuide.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { translateServerError } from '$lib/forms/server-error';
	import { patchAssignment } from '$lib/services/assignment-api';
	import { syncStateToUrl } from '$lib/state/url-state.svelte';
	import type { Assignment as DbAssignment } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// DB 形式のアサインを source of truth として保持。
	// timeline 形式 (end-exclusive Date) は $derived で都度 compose する。
	// #184: data.assignments は server load 由来 (immutable snapshot)、 一方 dbAssignments は
	// drag/resize の optimistic update を直接書き換える reactive。 server confirm が
	// invalidateAll → load 再実行で data.assignments を更新したら、 本 $effect で再同期して
	// server truth に rebase する。 trade-off: server confirm 後に optimistic state が一時
	// 巻き戻る瞬間 (data 更新 → 再 sync の間) があるが、 通常 < 1 frame で気付かれない。
	let dbAssignments = $state<DbAssignment[]>([]);
	$effect(() => {
		dbAssignments = data.assignments;
	});

	// #121 / #184: optimistic UI 用に resources / projects も local state へ lift。
	// 同上の trade-off: server confirm 後の rebase 動作で local 楽観追加 entity (temp ID) が
	// 一瞬消えて server entity (real ID) に置き換わる。 ResourceManager で
	// onOptimisticCreate / onConfirmCreate を expose し、 swap を呼び出し側で同期させる。
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

	// #99 item 2 / #174: viewport / zoom を URL `?d=YYYY-MM-DD&z=day|week|month|year` と双方向
	// 同期。 初期値は URL から復元、 無ければ今日 + day zoom。 sync は `syncStateToUrl` helper
	// で集約 ($effect ループ回避のため getState 経由で current 値を都度読む)。
	const initialUrlState = parseTimelineParams(page.url.searchParams);
	let viewportStart = $state(initialUrlState.viewportStart ?? new Date());
	let zoom = $state(initialUrlState.zoom ?? ZOOMS.day);
	syncStateToUrl(() => ({ viewportStart, zoom }), applyTimelineParams);

	/**
	 * UC-04 ドラッグ移動 / リサイズ。
	 *
	 * Optimistic UI パターン (ADR 0005):
	 * 1. 旧 state を snapshot
	 * 2. local state を即時更新 (帯が新位置に移動)
	 * 3. PATCH /api/assignments/[id] に永続化リクエスト (#180 で service 層に切り出し、
	 *    wire format は #179 で form action と統一した ServerErrors)
	 * 4. 失敗したら snapshot に revert + toast 表示 (server error は translateServerError 経由)
	 */
	async function handleUpdate(updated: TimelineAssignment) {
		const prev = dbAssignments.find((a) => a.id === updated.id);
		if (!prev) return;
		const next = fromTimelineAssignment(updated, prev);

		const snapshot = dbAssignments;
		dbAssignments = dbAssignments.map((a) => (a.id === next.id ? next : a));

		const result = await patchAssignment(next.id, {
			prevStartDate: prev.startDate,
			resourceId: next.resourceId,
			projectId: next.projectId,
			startDate: next.startDate,
			endDateExclusive: next.endDateExclusive
		});
		if (!result.ok) {
			dbAssignments = snapshot;
			const firstError = result.errors ? Object.values(result.errors)[0] : null;
			const description = firstError
				? translateServerError(firstError)
				: t('assignments.networkError');
			toast.error(t('assignments.updateError'), { description });
		}
	}
</script>

<AppHeader
	{resources}
	{projects}
	assignments={dbAssignments}
	user={data.user}
	csrfToken={data.csrfToken}
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

		<!--
			ui-components 0.9.3 で resourceColWidth='auto' が **Canvas measureText** で
			再実装され、 sticky 衝突問題 (旧 #34 / 本番事故 #162) を解消。 長名 resource は
			ellipsis 切れせず最大 400px まで rail が自動拡張する。 同 release で hover
			tooltip もカーソル追従に修正済 (#42)。 home-layout.spec.ts の auto-fit /
			cursor-anchor assertion が regression を守る。
		-->
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
