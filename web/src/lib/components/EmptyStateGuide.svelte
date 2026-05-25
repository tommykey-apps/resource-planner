<script lang="ts">
	import Check from 'phosphor-svelte/lib/Check';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * 3-step onboarding chip (#99 item 3)。「人 → 案件 → アサイン」 の 3 段階を可視化し、
	 * 各 step は対応する entity が >0 件存在すれば done として ✓ 表示する。
	 *
	 * すべて done になったらコンポーネント自身が null を返し、UI から消える。
	 *
	 * #182: 3 step を array にして {#each} で 1 markup に集約。 step 追加も label を増やすだけ。
	 */
	let {
		resourceCount,
		projectCount,
		assignmentCount
	}: {
		resourceCount: number;
		projectCount: number;
		assignmentCount: number;
	} = $props();

	const steps = $derived([
		{ done: resourceCount > 0, label: t('emptyGuide.step1') },
		{ done: projectCount > 0, label: t('emptyGuide.step2') },
		{ done: assignmentCount > 0, label: t('emptyGuide.step3') }
	]);
	const allDone = $derived(steps.every((s) => s.done));
</script>

{#if !allDone}
	<ol class="mb-6 grid gap-3 sm:grid-cols-3" aria-label={t('emptyGuide.label')}>
		{#each steps as step, i (i)}
			<li
				class="flex items-center gap-2 rounded border px-3 py-2 text-sm transition-colors"
				class:border-primary={step.done}
				class:bg-primary={step.done}
				class:text-primary-foreground={step.done}
				class:border-border={!step.done}
				class:bg-card={!step.done}
				data-testid="empty-step-{i + 1}"
				data-done={step.done}
			>
				<span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border">
					{#if step.done}
						<Check size={14} weight="bold" aria-hidden="true" />
					{:else}
						<span aria-hidden="true">{i + 1}</span>
					{/if}
				</span>
				<span>{step.label}</span>
			</li>
		{/each}
	</ol>
{/if}
