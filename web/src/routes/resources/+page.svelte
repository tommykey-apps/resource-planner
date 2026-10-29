<script lang="ts">
	import { toast } from 'svelte-sonner';
	import ResourceManager from '$lib/components/ResourceManager.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import type { Resource } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// #121 / #184: 楽観追加のため resources を local state へ lift。 server confirm 後の
	// invalidateAll で data.resources が更新されたら server truth に rebase する。
	let resources = $state<Resource[]>([]);
	$effect(() => {
		resources = data.resources;
	});

	function optimisticAdd(temp: Resource) {
		resources = [...resources, temp];
	}
	function confirmCreate(temp: Resource, real: Resource) {
		resources = resources.map((r) => (r.id === temp.id ? real : r));
	}
	function rollbackCreate(temp: Resource) {
		resources = resources.filter((r) => r.id !== temp.id);
		toast.error(t('resources.createFailed'));
	}
</script>

<svelte:head>
	<title>{t('nav.resourcesLink')} — {t('app.title')}</title>
</svelte:head>

<main class="mx-auto max-w-[1200px] px-4 py-6">
	<div class="mb-4 flex items-baseline gap-3">
		<h1 class="m-0 text-xl font-semibold">{t('nav.resourcesLink')}</h1>
	</div>
	<ResourceManager
		{resources}
		assignments={data.assignments}
		departments={data.departments}
		onOptimisticCreate={optimisticAdd}
		onConfirmCreate={confirmCreate}
		onRollbackCreate={rollbackCreate}
	/>
</main>
