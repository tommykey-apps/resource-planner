<script lang="ts">
	import ProjectManager from '$lib/components/ProjectManager.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{t('nav.projectsLink')} — {t('app.title')}</title>
</svelte:head>

<main class="mx-auto max-w-[1200px] px-4 py-6">
	<div class="mb-4 flex items-baseline gap-3">
		<h1 class="m-0 text-xl font-semibold">{t('nav.projectsLink')}</h1>
	</div>
	<ProjectManager projects={data.projects} assignments={data.assignments} />
</main>
