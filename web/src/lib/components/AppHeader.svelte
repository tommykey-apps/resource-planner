<script lang="ts">
	import ResourceManager from './ResourceManager.svelte';
	import ProjectManager from './ProjectManager.svelte';
	import DepartmentManager from './DepartmentManager.svelte';
	import AssignmentCreator from './AssignmentCreator.svelte';
	import AvatarDropdown from './AvatarDropdown.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import LocaleSwitcher from './LocaleSwitcher.svelte';
	import { Button } from './ui/button';
	import ListChecks from 'phosphor-svelte/lib/ListChecks';
	import Calendar from 'phosphor-svelte/lib/Calendar';
	import { t } from '$lib/i18n/index.svelte';
	import type { Resource, Project, Assignment, Department } from '$lib/types';

	/**
	 * アプリ共通ヘッダ (#136、 #146)。
	 *
	 * - logo + アプリ名 + Resource/Project/AssignmentCreator + アサイン一覧 button +
	 *   LocaleSwitcher + ThemeToggle + AvatarDropdown を一列で並べる
	 * - `/` と `/assignments` の両方から mount する (sign-in 系は除外、 layout 共有しない)
	 * - **optimistic create callbacks** はホーム側だけで渡す (#121)。 /assignments 側は省略すると
	 *   ResourceManager 内で通常 invalidate path (`update()`) に fallback する
	 * - `isAssignmentsActive` / `isHomeActive` で各 nav の現在地ハイライト
	 *   (`aria-current="page"`)。 /assignments から home (timeline / Gantt) への
	 *   named nav button を /assignments 用と対称に配置 (#nav-symmetry)。
	 */
	let {
		resources,
		projects,
		assignments,
		departments,
		user,
		csrfToken,
		isAssignmentsActive = false,
		isHomeActive = false,
		onOptimisticCreateResource,
		onConfirmCreateResource,
		onRollbackCreateResource
	}: {
		resources: Resource[];
		projects: Project[];
		assignments: Assignment[];
		departments: Department[];
		user: { email?: string | null | undefined } | undefined;
		csrfToken: string;
		isAssignmentsActive?: boolean;
		isHomeActive?: boolean;
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
			<DepartmentManager {departments} />
			<AssignmentCreator {resources} {projects} />
			<!-- Timeline (home / ガント) への named nav button、 /assignments と対称。 -->
			<Button
				variant={isHomeActive ? 'default' : 'outline'}
				href="/"
				aria-current={isHomeActive ? 'page' : undefined}
			>
				<Calendar size={18} weight="regular" aria-hidden="true" />
				<span class="hidden sm:ml-1 sm:inline">{t('nav.timelineLink')}</span>
			</Button>
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
			<AvatarDropdown email={user?.email ?? ''} {csrfToken} />
		</div>
	</div>
</header>
