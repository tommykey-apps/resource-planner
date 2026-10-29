<script lang="ts">
	import DepartmentManager from '$lib/components/DepartmentManager.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{t('nav.departmentsLink')} — {t('app.title')}</title>
</svelte:head>

<main class="mx-auto max-w-[1200px] px-4 py-6">
	<div class="mb-4 flex items-baseline gap-3">
		<h1 class="m-0 text-xl font-semibold">{t('nav.departmentsLink')}</h1>
		<span class="text-sm text-muted-foreground"
			>{t('common.count', { count: data.departments.length })}</span
		>
	</div>
	<DepartmentManager departments={data.departments} resources={data.resources} />
</main>
