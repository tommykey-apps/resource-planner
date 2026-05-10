<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from './ui/button';
	import Dialog from './Dialog.svelte';
	import { addDays } from '$lib/date';
	import { createSubmitState } from '$lib/forms/submit-state.svelte';
	import type { Assignment, Resource, Project } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';

	let {
		assignments,
		resources,
		projects
	}: {
		assignments: Assignment[];
		resources: Resource[];
		projects: Project[];
	} = $props();

	let open = $state(false);

	const resourceMap = $derived(new Map(resources.map((r) => [r.id, r])));
	const projectMap = $derived(new Map(projects.map((p) => [p.id, p])));

	// startDate 昇順 → 終了日昇順でソート
	const sorted = $derived(
		[...assignments].sort((a, b) => {
			if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
			return a.endDateExclusive < b.endDateExclusive ? -1 : 1;
		})
	);

	/** DB の `endDateExclusive` を表示用 inclusive に変換 (ADR 0004)。 */
	function displayEndDate(a: Assignment): string {
		return addDays(a.endDateExclusive, -1);
	}

	// 連打抑制 + submitting state (#94)
	const deleteSubmitState = createSubmitState();
	const deleteSubmit: SubmitFunction = deleteSubmitState.wrap();
</script>

<Button variant="outline" onclick={() => (open = true)}>
	📋<span class="hidden sm:ml-1 sm:inline">アサイン一覧 ({assignments.length})</span>
</Button>

<Dialog bind:open title="アサイン一覧" description="登録済みアサインの一覧と削除">
	<div class="flex flex-col gap-3">
		{#if sorted.length === 0}
			<p class="py-4 text-center text-sm text-muted-foreground">
				まだアサインが登録されていません。<br />
				右上の「+ アサインを追加」から作成できます。
			</p>
		{:else}
			<ul class="max-h-[60vh] divide-y divide-border overflow-y-auto border border-border">
				{#each sorted as a (a.id)}
					{@const resource = resourceMap.get(a.resourceId)}
					{@const project = projectMap.get(a.projectId)}
					<li class="flex items-center justify-between gap-2 px-3 py-2">
						<div class="flex flex-1 items-center gap-3 text-sm">
							<span
								class="inline-block h-3 w-3 shrink-0 border border-black/10"
								style="background-color: {project?.color ??
									'#999'}; border-radius: calc(var(--radius) * 0.4)"
								aria-hidden="true"
							></span>
							<div class="flex flex-1 flex-col">
								<span>
									{resource?.name ?? '(削除済リソース)'}
									<span class="text-muted-foreground">×</span>
									{project?.name ?? '(削除済案件)'}
								</span>
								<span class="font-mono text-xs text-muted-foreground">
									{a.startDate} 〜 {displayEndDate(a)}
								</span>
							</div>
						</div>
						<form
							method="POST"
							action="?/deleteAssignment"
							use:enhance={deleteSubmit}
							onsubmit={(e) => {
								const label = `${resource?.name ?? '(不明)'} × ${project?.name ?? '(不明)'} (${a.startDate} 〜 ${displayEndDate(a)})`;
								if (!confirm(`このアサインを削除しますか?\n${label}`)) {
									e.preventDefault();
								}
							}}
						>
							<input type="hidden" name="id" value={a.id} />
							<input type="hidden" name="startDate" value={a.startDate} />
							<Button
								size="xs"
								variant="destructive"
								type="submit"
								disabled={deleteSubmitState.submitting}
							>
								削除
							</Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Dialog>
