<script lang="ts">
	import ResourceManager from './ResourceManager.svelte';
	import ProjectManager from './ProjectManager.svelte';
	import AssignmentCreator from './AssignmentCreator.svelte';
	import AvatarDropdown from './AvatarDropdown.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import LocaleSwitcher from './LocaleSwitcher.svelte';
	import { Button } from './ui/button';
	import ListChecks from 'phosphor-svelte/lib/ListChecks';
	import { t } from '$lib/i18n/index.svelte';
	import type { Resource, Project, Assignment } from '$lib/types';

	/**
	 * アプリ共通ヘッダ (#136、 #146)。
	 *
	 * - logo + アプリ名 + Resource/Project/AssignmentCreator + アサイン一覧 button +
	 *   LocaleSwitcher + ThemeToggle + AvatarDropdown を一列で並べる
	 * - `/` と `/assignments` の両方から mount する (sign-in 系は除外、 layout 共有しない)
	 * - **optimistic create callbacks** はホーム側だけで渡す (#121)。 /assignments 側は省略すると
	 *   ResourceManager 内で通常 invalidate path (`update()`) に fallback する
	 * - `isAssignmentsActive` で /assignments の現在地ハイライト (`aria-current="page"`)
	 */
	let {
		resources,
		projects,
		assignments,
		user,
		isAssignmentsActive = false,
		onOptimisticCreateResource,
		onConfirmCreateResource,
		onRollbackCreateResource
	}: {
		resources: Resource[];
		projects: Project[];
		assignments: Assignment[];
		user: { email?: string | null | undefined } | undefined;
		isAssignmentsActive?: boolean;
		onOptimisticCreateResource?: (temp: Resource) => void;
		onConfirmCreateResource?: (temp: Resource, real: Resource) => void;
		onRollbackCreateResource?: (temp: Resource) => void;
	} = $props();
</script>

<header class="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
	<div class="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 px-4 py-3">
		<a href="/" class="flex items-center gap-2 no-underline">
			<img src="/header-icon.png" alt="" width="32" height="32" class="h-8 w-8 shrink-0" />
			<h1 class="m-0 text-lg font-semibold tracking-tight sm:text-xl">{t('app.title')}</h1>
		</a>
		<div class="flex flex-wrap items-center gap-2">
			<ResourceManager
				{resources}
				{assignments}
				onOptimisticCreate={onOptimisticCreateResource}
				onConfirmCreate={onConfirmCreateResource}
				onRollbackCreate={onRollbackCreateResource}
			/>
			<ProjectManager {projects} {assignments} />
			<AssignmentCreator {resources} {projects} />
			<Button
				variant={isAssignmentsActive ? 'default' : 'outline'}
				href="/assignments"
				aria-current={isAssignmentsActive ? 'page' : undefined}
			>
				<ListChecks size={18} weight="regular" aria-hidden="true" />
				<span class="hidden sm:ml-1 sm:inline"
					>{t('assignments.listWithCount', { count: assignments.length })}</span
				>
			</Button>
			<LocaleSwitcher />
			<ThemeToggle />
			<AvatarDropdown email={user?.email ?? ''} />
		</div>
	</div>
</header>
