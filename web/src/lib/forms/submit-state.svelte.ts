/**
 * Form submit-state helper (#94)。
 *
 * `use:enhance` の SubmitFunction を wrap して:
 * - submit 開始で `submitting = true` (synchronous)
 * - 重複呼び出しは `cancel()` で抑止 (連打 → DB 重複作成の data integrity 問題対応)
 * - server response 後に `submitting = false` (try/finally で例外時もリセット)
 * - user 提供の SubmitFunction の before / after callback も chain
 *
 * `web/src/lib/forms/submit-state.svelte.test.ts` で挙動を保証。
 */
import type { SubmitFunction } from '@sveltejs/kit';

export interface SubmitState {
	readonly submitting: boolean;
	wrap: (inner?: SubmitFunction) => SubmitFunction;
}

export function createSubmitState(): SubmitState {
	let submitting = $state(false);

	const wrap = (inner?: SubmitFunction): SubmitFunction => {
		return (input) => {
			if (submitting) {
				input.cancel();
				return;
			}
			submitting = true;
			const innerAfter = inner?.(input);

			return async (afterArgs) => {
				try {
					if (typeof innerAfter === 'function') {
						await innerAfter(afterArgs);
					} else {
						await afterArgs.update();
					}
				} finally {
					submitting = false;
				}
			};
		};
	};

	return {
		get submitting() {
			return submitting;
		},
		wrap
	};
}
