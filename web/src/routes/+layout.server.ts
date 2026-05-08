import { error } from '@sveltejs/kit';
import { buildClerkProps } from 'svelte-clerk/server';
import { queryAllByOrg } from '$lib/repository';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const auth = locals.auth();

	// 未認証は +layout.svelte の <RedirectToSignIn /> で誘導されるため、ここでは
	// orgId が無いケースのみハンドリング (ADR 0001 + plan ファイル UC 確定事項:
	// Clerk Org 必須 ON 前提)。
	if (auth.userId && !auth.orgId) {
		// Org 未所属 / 未選択の場合。Clerk Account Portal で Org を作成 / 選択して再ログインさせる。
		// メッセージは +error.svelte (Orphan PR) で UI 化予定。
		error(
			403,
			'組織が選択されていません。Clerk の Account Portal から組織を作成または選択してください。'
		);
	}

	const data = auth.orgId
		? await queryAllByOrg(auth.orgId)
		: { resources: [], projects: [], assignments: [] };

	return {
		...buildClerkProps(auth),
		...data
	};
};
