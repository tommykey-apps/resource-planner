<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	// 連打防止 (#94)。Auth.js auto endpoint への直接 POST なので `use:enhance` ではなく
	// 生 onsubmit + $state で一回限りに。送信後はページ遷移するため reset は不要。
	let submitting = $state(false);

	function onSubmit(e: Event) {
		if (submitting) {
			e.preventDefault();
			return;
		}
		submitting = true;
	}
</script>

<svelte:head>
	<title>{m.signin_title()} — {m.app_title()}</title>
</svelte:head>

<main class="container mx-auto max-w-md px-4 py-12">
	<h1 class="mb-2 text-2xl font-bold">{m.signin_title()}</h1>
	<p class="mb-6 text-sm text-muted-foreground">
		{m.signin_description()}
	</p>

	<!--
		Auth.js が `/auth/signin/nodemailer` を auto-register (hooks.server.ts の handle 経由)。
		csrfToken は同じ origin で Auth.js が cookie をセット済 (handle が GET 時に注入)。
		#168: callbackUrl を明示しないと verify 後に signin 元 page (= /sign-in) へ戻り、
		user は email 入力 form を見て 「失敗?」 と誤認する。 home (/) を hidden で固定。
	-->
	<form method="POST" action="/auth/signin/nodemailer" class="space-y-4" onsubmit={onSubmit}>
		<input type="hidden" name="csrfToken" value={data.csrfToken} />
		<input type="hidden" name="callbackUrl" value="/" />
		<div>
			<label for="email" class="mb-1 block text-sm font-medium">{m.signin_emailLabel()}</label>
			<input
				id="email"
				name="email"
				type="email"
				required
				autocomplete="email"
				readonly={submitting}
				class="w-full rounded border border-input bg-background px-3 py-2 read-only:opacity-60"
				placeholder={m.signin_emailPlaceholder()}
			/>
		</div>
		<button
			type="submit"
			disabled={submitting}
			class="w-full cursor-pointer rounded bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
		>
			{submitting ? m.signin_submitting() : m.signin_submit()}
		</button>
	</form>

	<p class="mt-6 text-xs text-muted-foreground">
		{m.signin_hint()}
	</p>
</main>
