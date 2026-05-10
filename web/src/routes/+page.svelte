<script lang="ts">
	import {
		ResourceTimeline,
		TimelineToolbar,
		ZOOMS,
		type Assignment as TimelineAssignment
	} from '@tommykey-apps/ui-components';
	import { toast } from 'svelte-sonner';
	import { toTimelineAssignment, fromTimelineAssignment } from '$lib/timeline-adapter';
	import ResourceManager from '$lib/components/ResourceManager.svelte';
	import ProjectManager from '$lib/components/ProjectManager.svelte';
	import AssignmentCreator from '$lib/components/AssignmentCreator.svelte';
	import AssignmentManager from '$lib/components/AssignmentManager.svelte';
	import AvatarDropdown from '$lib/components/AvatarDropdown.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
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

	let viewportStart = $state(new Date());
	let zoom = $state(ZOOMS.day);

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
			toast.error('アサインの更新に失敗しました', {
				description: e instanceof Error ? e.message : '通信エラー'
			});
		}
	}
</script>

<header class="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
	<div class="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 px-4 py-3">
		<h1 class="m-0 text-lg font-semibold tracking-tight sm:text-xl">resource-planner</h1>
		<div class="flex flex-wrap items-center gap-2">
			<ResourceManager {resources} assignments={dbAssignments} />
			<ProjectManager {projects} assignments={dbAssignments} />
			<AssignmentCreator {resources} {projects} />
			<AssignmentManager assignments={dbAssignments} {resources} {projects} />
			<ThemeToggle />
			<AvatarDropdown email={data.user?.email ?? ''} />
		</div>
	</div>
</header>

<main class="mx-auto max-w-[1200px] px-4 py-6">
	{#if resources.length === 0}
		<div class="empty-state">
			<p>まだ人が登録されていません。</p>
			<p class="hint">右上の「人を管理」ボタンから最初のリソースを追加してください。</p>
		</div>
	{:else}
		<TimelineToolbar
			bind:viewportStart
			bind:zoom
			labels={{
				today: '今日',
				prev: '前へ',
				next: '次へ',
				zoomDay: '日',
				zoomWeek: '週',
				zoomMonth: '月',
				zoomYear: '年'
			}}
			ariaLabels={{ prev: '前の期間へ', next: '次の期間へ' }}
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
