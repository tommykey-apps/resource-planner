<script lang="ts">
	import ProjectManager from '$lib/components/ProjectManager.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{m.nav_projectsLink()} — {m.app_title()}</title>
</svelte:head>

<main class="mx-auto max-w-[1200px] px-4 py-6">
	<div class="mb-4 flex items-baseline gap-3">
		<h1 class="m-0 text-xl font-semibold">{m.nav_projectsLink()}</h1>
	</div>
	<ProjectManager projects={data.projects} assignments={data.assignments} />
</main>
