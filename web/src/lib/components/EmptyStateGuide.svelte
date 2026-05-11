<script lang="ts">
	import Check from 'phosphor-svelte/lib/Check';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * 3-step onboarding chip (#99 item 3)。「人 → 案件 → アサイン」 の 3 段階を可視化し、
	 * 各 step は対応する entity が >0 件存在すれば done として ✓ 表示する。
	 *
	 * すべて done になったらコンポーネント自身が null を返し、UI から消える。
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

	const step1Done = $derived(resourceCount > 0);
	const step2Done = $derived(projectCount > 0);
	const step3Done = $derived(assignmentCount > 0);
	const allDone = $derived(step1Done && step2Done && step3Done);
</script>

{#if !allDone}
	<ol class="mb-6 grid gap-3 sm:grid-cols-3" aria-label={t('emptyGuide.label')}>
		<li
			class="flex items-center gap-2 rounded border px-3 py-2 text-sm transition-colors"
			class:border-primary={step1Done}
			class:bg-primary={step1Done}
			class:text-primary-foreground={step1Done}
			class:border-border={!step1Done}
			class:bg-card={!step1Done}
			data-testid="empty-step-1"
			data-done={step1Done}
		>
			<span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border">
				{#if step1Done}
					<Check size={14} weight="bold" aria-hidden="true" />
				{:else}
					<span aria-hidden="true">1</span>
				{/if}
			</span>
			<span>{t('emptyGuide.step1')}</span>
		</li>
		<li
			class="flex items-center gap-2 rounded border px-3 py-2 text-sm transition-colors"
			class:border-primary={step2Done}
			class:bg-primary={step2Done}
			class:text-primary-foreground={step2Done}
			class:border-border={!step2Done}
			class:bg-card={!step2Done}
			data-testid="empty-step-2"
			data-done={step2Done}
		>
			<span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border">
				{#if step2Done}
					<Check size={14} weight="bold" aria-hidden="true" />
				{:else}
					<span aria-hidden="true">2</span>
				{/if}
			</span>
			<span>{t('emptyGuide.step2')}</span>
		</li>
		<li
			class="flex items-center gap-2 rounded border px-3 py-2 text-sm transition-colors"
			class:border-primary={step3Done}
			class:bg-primary={step3Done}
			class:text-primary-foreground={step3Done}
			class:border-border={!step3Done}
			class:bg-card={!step3Done}
			data-testid="empty-step-3"
			data-done={step3Done}
		>
			<span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border">
				{#if step3Done}
					<Check size={14} weight="bold" aria-hidden="true" />
				{:else}
					<span aria-hidden="true">3</span>
				{/if}
			</span>
			<span>{t('emptyGuide.step3')}</span>
		</li>
	</ol>
{/if}
