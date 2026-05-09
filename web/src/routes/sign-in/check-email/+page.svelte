<svelte:head>
	<title>メールを確認してください — resource-planner</title>
</svelte:head>

<main class="container mx-auto max-w-md px-4 py-12">
	<h1 class="mb-2 text-2xl font-bold">メールを確認してください</h1>
	<p class="mb-4">
		サインインリンクをメールで送信しました。メール内のリンクをクリックしてサインインを完了してください。
	</p>
	<p class="text-sm text-muted-foreground">
		メールが届かない場合は、迷惑メールフォルダを確認してください。リンクは 24 時間で失効します。
	</p>

	<div class="mt-6">
		<a href="/sign-in" class="text-sm text-primary underline">別のメールアドレスで再送信</a>
	</div>
</main>
