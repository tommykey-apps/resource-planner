<script lang="ts">
	// #166: Auth Core (/auth/signout) に double-submit CSRF (cookie 値 + body 値) で
	// POST する form。 sign-in と同じ pattern。 wrapper signOut helper は body から
	// csrfToken を drop するため、 wrapper を経由せず /auth/signout に直接 POST する。
	// callbackUrl は sign-out 後の Auth.js redirect 先 (layout の auth guard と合流して
	// 必ず /sign-in に着地)。
	let { csrfToken, label }: { csrfToken: string; label: string } = $props();
</script>

<form method="POST" action="/auth/signout" class="w-full">
	<input type="hidden" name="csrfToken" value={csrfToken} />
	<input type="hidden" name="callbackUrl" value="/sign-in" />
	<button
		type="submit"
		class="flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent"
	>
		{label}
	</button>
</form>
