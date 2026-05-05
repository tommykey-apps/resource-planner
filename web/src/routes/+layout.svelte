<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import {
		ClerkProvider,
		ClerkLoading,
		ClerkLoaded,
		Show,
		RedirectToSignIn
	} from 'svelte-clerk';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<ClerkProvider>
	<ClerkLoading>
		<div class="loading">読み込み中...</div>
	</ClerkLoading>
	<ClerkLoaded>
		<Show when="signed-in">
			{@render children()}
		</Show>
		<Show when="signed-out">
			<div class="loading">サインインへ移動中...</div>
			<RedirectToSignIn />
		</Show>
	</ClerkLoaded>
</ClerkProvider>

<style>
	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		color: #888;
	}
</style>
