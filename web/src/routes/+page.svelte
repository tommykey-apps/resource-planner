<script lang="ts">
	import {
		ResourceTimeline,
		TimelineToolbar,
		ZOOMS,
		type Assignment as TimelineAssignment
	} from '@tommykey-apps/ui-components';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toTimelineAssignment, fromTimelineAssignment } from '$lib/timeline-adapter';
	import { applyTimelineParams, parseTimelineParams } from '$lib/timeline-url-state';
	import {
		flattenDepartmentTree,
		resourceIdsForDepartmentFilter,
		DEPARTMENT_FILTER_UNASSIGNED
	} from '$lib/repository/department-tree';
	import AssignmentCreator from '$lib/components/AssignmentCreator.svelte';
	import AssignmentEditor from '$lib/components/AssignmentEditor.svelte';
	import EmptyStateGuide from '$lib/components/EmptyStateGuide.svelte';
	import { m } from '$lib/paraglide/messages.js';
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
	// invalidateAll → load 再実行で data.assignments を更新したら、 writable $derived が再計算して
	// server truth に rebase する。 trade-off: server confirm 後に optimistic state が一時
	// 巻き戻る瞬間 (data 更新 → 再 sync の間) があるが、 通常 < 1 frame で気付かれない。
	let dbAssignments = $derived<DbAssignment[]>(data.assignments);

	const resources = $derived(data.resources);
	const projects = $derived(data.projects);

	const projectMap = $derived(new Map(projects.map((p) => [p.id, p])));

	const timelineAssignments = $derived(
		dbAssignments.map((a) => toTimelineAssignment(a, projectMap.get(a.projectId)))
	);

	// #99 item 2 / #174: viewport / zoom を URL `?d=YYYY-MM-DD&z=day|week|month|year` と双方向
	// 同期。 初期値は URL から復元、 無ければ今日 + day zoom。 sync は `syncStateToUrl` helper
	// で集約 ($effect ループ回避のため getState 経由で current 値を都度読む)。
	const initialUrlState = parseTimelineParams(page.url.searchParams);
	let viewportStart = $state(initialUrlState.viewportStart ?? new Date());
	// デフォルトの表示単位は月 (URL `?z=` 指定があればそれを優先)。
	let zoom = $state(initialUrlState.zoom ?? ZOOMS.month);
	// #242: 部署フィルタ (子孫含む) も URL (`?dept=`) と同期。
	let departmentId = $state(initialUrlState.departmentId);
	syncStateToUrl(() => ({ viewportStart, zoom, departmentId }), applyTimelineParams);

	// #242: 部署 (子孫含む) で resource 行と帯を絞り込む。 null = フィルタなし (全件)。
	// 注: フィルタ中に楽観追加した resource (temp は departmentId なし) は未所属扱いで、 部署
	// フィルタ中は行が出ない (server confirm 後に実 departmentId が付けば再評価される)。 想定どおり。
	const departmentOptions = $derived(flattenDepartmentTree(data.departments));
	const deptResourceIds = $derived(
		resourceIdsForDepartmentFilter(data.departments, resources, departmentId)
	);
	const visibleResources = $derived(
		deptResourceIds ? resources.filter((r) => deptResourceIds.has(r.id)) : resources
	);
	const visibleAssignments = $derived(
		deptResourceIds
			? timelineAssignments.filter((a) => deptResourceIds.has(a.resourceId))
			: timelineAssignments
	);

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
			expectedVersion: prev.version,
			resourceId: next.resourceId,
			projectId: next.projectId,
			startDate: next.startDate,
			endDateExclusive: next.endDateExclusive
		});
		if (result.ok) {
			// ADR 0012: server 確定 version をローカルに反映し、 次回編集の expectedVersion を正にする。
			dbAssignments = dbAssignments.map((a) =>
				a.id === next.id ? { ...a, version: result.version } : a
			);
			return;
		}
		// #231: 後続ドラッグに supersede された PATCH は最新の楽観 state を保持し、 revert / toast しない。
		if ('superseded' in result) return;
		// ADR 0012: 楽観ロック競合 = 他ユーザが先に更新。 最新を表示して自分のドラッグは破棄 + 通知。
		if ('conflict' in result) {
			const latest = result.latest;
			dbAssignments = latest
				? dbAssignments.map((a) => (a.id === latest.id ? latest : a))
				: snapshot;
			toast.error(m.assignments_conflict());
			return;
		}
		dbAssignments = snapshot;
		const firstError = result.errors ? Object.values(result.errors)[0] : null;
		const description = firstError
			? translateServerError(firstError)
			: m.assignments_networkError();
		toast.error(m.assignments_updateError(), { description });
	}

	/**
	 * #206: 帯 click (移動量 < 4px、 ui-components#85/#92 で click vs drag 分離済) で
	 * AssignmentEditor を起動。 keyboard Enter/Space でも同 callback (APG Button pattern)。
	 * onActivate は TimelineAssignment を渡してくるので id で dbAssignments を lookup する。
	 */
	let editing = $state<DbAssignment | null>(null);
	let editOpen = $state(false);

	function openEditor(activated: TimelineAssignment) {
		const found = dbAssignments.find((a) => a.id === activated.id);
		if (!found) return;
		editing = found;
		editOpen = true;
	}
</script>

<svelte:head>
	<title>{m.nav_timelineLink()} — {m.app_title()}</title>
</svelte:head>

<main class="mx-auto max-w-[1200px] px-4 py-6">
	<div class="mb-4 flex items-center justify-between gap-2">
		<h1 class="m-0 text-xl font-semibold">{m.nav_timelineLink()}</h1>
		<AssignmentCreator {resources} {projects} />
	</div>

	<EmptyStateGuide
		resourceCount={resources.length}
		projectCount={projects.length}
		assignmentCount={dbAssignments.length}
	/>

	{#if resources.length === 0}
		<div class="empty-state">
			<p>
				{m.resources_empty()}
				<a href={resolve('/resources')} class="underline">{m.resources_addNew()}</a>
			</p>
		</div>
	{:else}
		<TimelineToolbar
			bind:viewportStart
			bind:zoom
			labels={{
				today: m.timeline_today(),
				prev: m.timeline_prev(),
				next: m.timeline_next(),
				zoomDay: m.timeline_zoomDay(),
				zoomWeek: m.timeline_zoomWeek(),
				zoomMonth: m.timeline_zoomMonth(),
				zoomYear: m.timeline_zoomYear()
			}}
			ariaLabels={{ prev: m.timeline_prevAria(), next: m.timeline_nextAria() }}
		/>

		<!-- #242: 部署フィルタ (子孫含む)。 選ぶと resource 行 + 帯が絞り込まれ、 URL `?dept=` に同期。 -->
		<div class="dept-filter">
			<label for="timeline-dept-filter">{m.departments_field()}</label>
			<select id="timeline-dept-filter" bind:value={departmentId}>
				<option value="">{m.departments_allOption()}</option>
				<option value={DEPARTMENT_FILTER_UNASSIGNED}>{m.departments_unassigned()}</option>
				{#each departmentOptions as { dept, depth } (dept.id)}
					<option value={dept.id}>{'\u00A0\u00A0'.repeat(depth)}{dept.name}</option>
				{/each}
			</select>
		</div>

		<!--
			ui-components 0.9.3 で resourceColWidth='auto' が **Canvas measureText** で
			再実装され、 sticky 衝突問題 (旧 #34 / 本番事故 #162) を解消。 長名 resource は
			ellipsis 切れせず最大 400px まで rail が自動拡張する。
			ui-components 1.0.0 (#84 BREAKING) で hover tooltip 全廃 + label sticky 化 に変更、
			wide bar (viewport を超える長期間 assignment) でも label が常時 viewport 内に
			貼り付くようになった。 旧 tooltip 関連 E2E spec は home-layout.spec.ts で削除済。
		-->
		<ResourceTimeline
			resources={visibleResources}
			assignments={visibleAssignments}
			bind:viewportStart
			{zoom}
			resourceColWidth="auto"
			labels={{
				bar: {
					resizeStart: m.timeline_barResizeStart(),
					resizeEnd: m.timeline_barResizeEnd()
				},
				canvas: { region: m.timeline_canvasRegion() },
				status: {
					move: (range) => m.timeline_statusMoved({ range }),
					resizeStart: (range) => m.timeline_statusResizeStart({ range }),
					resizeEnd: (range) => m.timeline_statusResizeEnd({ range }),
					keyMove: (range) => m.timeline_statusKeyMoved({ range }),
					keyResizeStart: (range) => m.timeline_statusKeyResizeStart({ range }),
					keyResizeEnd: (range) => m.timeline_statusKeyResizeEnd({ range })
				}
			}}
			onMove={handleUpdate}
			onResize={handleUpdate}
			onActivate={openEditor}
		/>
	{/if}
</main>

<AssignmentEditor bind:open={editOpen} assignment={editing} {resources} {projects} />

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

	main :global(.toolbar) {
		margin-bottom: 1rem;
	}

	.dept-filter {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
		font-size: 0.875rem;
	}

	.dept-filter select {
		height: 2.25rem;
		border: 1px solid var(--input);
		background: var(--background);
		padding: 0 0.5rem;
		border-radius: calc(var(--radius) * 0.6);
	}
</style>
