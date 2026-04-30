<script lang="ts">
	import {
		ResourceTimeline,
		ZOOMS,
		type Assignment,
		type Resource
	} from '@tommykey-apps/ui-components';

	const resources: Resource[] = [
		{ id: 'tanaka', name: '田中 太郎' },
		{ id: 'suzuki', name: '鈴木 花子' },
		{ id: 'sato', name: '佐藤 一郎' },
		{ id: 'takahashi', name: '高橋 二郎' }
	];

	let assignments = $state<Assignment[]>([
		{
			id: 'a1',
			resourceId: 'tanaka',
			startDate: new Date(2026, 4, 4),
			endDate: new Date(2026, 4, 15),
			label: 'A社 案件',
			color: '#4f46e5'
		},
		{
			id: 'a2',
			resourceId: 'suzuki',
			startDate: new Date(2026, 4, 4),
			endDate: new Date(2026, 4, 22),
			label: 'B社 PoC',
			color: '#10b981'
		},
		{
			id: 'a3',
			resourceId: 'sato',
			startDate: new Date(2026, 4, 11),
			endDate: new Date(2026, 4, 25),
			label: '社内ツール',
			color: '#f59e0b'
		},
		{
			id: 'a4',
			resourceId: 'takahashi',
			startDate: new Date(2026, 4, 4),
			endDate: new Date(2026, 5, 8),
			label: 'D社 長期',
			color: '#ef4444'
		}
	]);

	let zoom = $state(ZOOMS.day);
</script>

<main>
	<h1>resource-planner</h1>
	<p>要員計画 / Powered by <code>@tommykey-apps/ui-components</code></p>

	<nav class="zoom-toolbar">
		<button onclick={() => (zoom = ZOOMS.day)} class:active={zoom.id === 'day'}>Day</button>
		<button onclick={() => (zoom = ZOOMS.week)} class:active={zoom.id === 'week'}>Week</button>
		<button onclick={() => (zoom = ZOOMS.month)} class:active={zoom.id === 'month'}>Month</button>
		<button onclick={() => (zoom = ZOOMS.year)} class:active={zoom.id === 'year'}>Year</button>
	</nav>

	<ResourceTimeline
		{resources}
		{assignments}
		viewportStart={new Date(2026, 4, 4)}
		{zoom}
		onMove={(updated) => {
			assignments = assignments.map((a) => (a.id === updated.id ? updated : a));
		}}
		onResize={(updated) => {
			assignments = assignments.map((a) => (a.id === updated.id ? updated : a));
		}}
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

	.zoom-toolbar {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.zoom-toolbar button {
		padding: 0.375rem 0.875rem;
		border: 1px solid #ddd;
		background: #fff;
		border-radius: 4px;
		cursor: pointer;
		font: inherit;
		font-size: 0.875rem;
	}

	.zoom-toolbar button:hover {
		background: #f5f5f5;
	}

	.zoom-toolbar button.active {
		background: #4f46e5;
		color: #fff;
		border-color: #4f46e5;
	}
</style>
