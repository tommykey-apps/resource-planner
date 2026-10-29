<script lang="ts">
	import { page } from '$app/state';
	import List from 'phosphor-svelte/lib/List';
	import X from 'phosphor-svelte/lib/X';
	import AvatarDropdown from './AvatarDropdown.svelte';
	import LocaleSwitcher from './LocaleSwitcher.svelte';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * アプリ共通ヘッダ (#136、 #146、 header 標準化)。
	 *
	 * デジタル庁デザインシステム「ヘッダーコンテナ」の構成に揃える:
	 * - ロゴ (左) / 水平メニュー = グローバルナビ / ヘッダーコンテナアイテム = 言語切替 + アカウント
	 * - 狭い画面 (< md) では水平メニューをハンバーガーメニューボタンで開閉する
	 *   (WAI-ARIA APG Disclosure Navigation: button の aria-expanded + aria-controls)
	 * - 画面固有の操作 (アサイン追加・絞り込み) は各ページ本文に置き、 ヘッダーに載せない
	 *   (GOV.UK「Help users to navigate a service」: ページだけに効く要素はナビの後ろ)
	 * - 現在地は `page.url.pathname` で判定する。 root layout で 1 回だけ mount する。
	 */
	let {
		user,
		csrfToken
	}: {
		user: { email?: string | null | undefined } | undefined;
		csrfToken: string;
	} = $props();

	const NAV_ID = 'app-main-nav';

	const navItems = $derived([
		{ href: '/', label: m.nav_timelineLink() },
		{ href: '/assignments', label: m.nav_assignmentsLink() },
		{ href: '/resources', label: m.nav_resourcesLink() },
		{ href: '/projects', label: m.nav_projectsLink() },
		{ href: '/departments', label: m.nav_departmentsLink() }
	]);

	function isCurrent(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/') return path === '/';
		return path === href || path.startsWith(`${href}/`);
	}

	let menuOpen = $state(false);
</script>

<header class="sticky top-0 z-40 border-b border-border bg-background">
	<div class="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2 md:gap-x-6">
		<a href="/" class="flex shrink-0 items-center gap-2 no-underline">
			<img src="/header-icon.png" alt="" width="32" height="32" class="h-8 w-8 shrink-0" />
			<span class="text-base font-semibold tracking-tight sm:text-lg">{m.app_title()}</span>
		</a>

		<div class="order-2 ml-auto flex items-center gap-2 md:order-3">
			<LocaleSwitcher />
			<AvatarDropdown email={user?.email ?? ''} {csrfToken} />
			<button
				type="button"
				class="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border bg-background hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none md:hidden"
				aria-expanded={menuOpen}
				aria-controls={NAV_ID}
				aria-label={m.nav_menuToggle()}
				onclick={() => (menuOpen = !menuOpen)}
			>
				{#if menuOpen}
					<X size={18} aria-hidden="true" />
				{:else}
					<List size={18} aria-hidden="true" />
				{/if}
			</button>
		</div>

		<nav
			id={NAV_ID}
			aria-label={m.nav_label()}
			class="order-3 w-full md:order-2 md:block md:w-auto"
			class:hidden={!menuOpen}
		>
			<ul class="m-0 flex list-none flex-col p-0 md:flex-row md:gap-1">
				{#each navItems as item (item.href)}
					{@const current = isCurrent(item.href)}
					<li>
						<a
							href={item.href}
							aria-current={current ? 'page' : undefined}
							onclick={() => (menuOpen = false)}
							class="block border-b-2 px-3 py-3 text-sm no-underline hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none md:py-2 {current
								? 'border-foreground font-semibold text-foreground'
								: 'border-transparent text-muted-foreground'}"
						>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</header>
