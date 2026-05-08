<script lang="ts">
	import {
		ResourceTimeline,
		TimelineToolbar,
		ZOOMS,
		type Assignment as TimelineAssignment
	} from '@tommykey-apps/ui-components';
	import { toTimelineAssignment, fromTimelineAssignment } from '$lib/timeline-adapter';
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

	function handleUpdate(updated: TimelineAssignment) {
		// PR-F で +server.ts API への fetch + optimistic UI revert を追加予定。
		// 現状は in-memory のみ (リロードで消える)。
		const prev = dbAssignments.find((a) => a.id === updated.id);
		if (!prev) return;
		const next = fromTimelineAssignment(updated, prev);
		dbAssignments = dbAssignments.map((a) => (a.id === next.id ? next : a));
	}
</script>

<main>
	<h1>resource-planner</h1>
	<p>要員計画 / Powered by <code>@tommykey-apps/ui-components</code></p>

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
</main>

<style>
	main {
		max-width: 1200px;
		margin: 2rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}

	h1 {
		margin: 0 0 0.25rem;
		font-size: 1.5rem;
	}

	p {
		margin: 0 0 1.5rem;
		color: #666;
		font-size: 0.875rem;
	}

	code {
		background: #eef;
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		font-family: ui-monospace, monospace;
		font-size: 0.875em;
	}

	main :global(.toolbar) {
		margin-bottom: 1rem;
	}
</style>
