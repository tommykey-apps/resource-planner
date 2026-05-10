import { describe, expect, it, vi } from 'vitest';
import { createSubmitState } from './submit-state.svelte';
import type { SubmitFunction } from '@sveltejs/kit';

/**
 * `createSubmitState` の unit test (#94)。
 * 連打 → 重複作成を防ぐため、submitting state と SubmitFunction wrapper を提供する helper の挙動を保証。
 *
 * UI 結合 (button が disabled される視覚) は別途 component / E2E test で検証。
 * 本 test は state 管理ロジックのみに focus する (jsdom 不要、node 環境)。
 */

// SvelteKit `SubmitFunction` のシグネチャに合わせた最小 mock 引数生成
function mockSubmitArgs() {
	return {
		formElement: {} as HTMLFormElement,
		formData: new FormData(),
		action: new URL('http://localhost/?/test'),
		controller: new AbortController(),
		submitter: null,
		cancel: vi.fn()
	};
}

describe('createSubmitState', () => {
	it('starts with submitting=false', () => {
		const s = createSubmitState();
		expect(s.submitting).toBe(false);
	});

	it('sets submitting=true synchronously when wrapped handler is invoked', () => {
		const s = createSubmitState();
		const handler = s.wrap();
		handler(mockSubmitArgs());
		expect(s.submitting).toBe(true);
	});

	it('cancels the second invocation while still submitting (連打抑制)', () => {
		const s = createSubmitState();
		const handler = s.wrap();
		const first = mockSubmitArgs();
		const second = mockSubmitArgs();
		handler(first);
		handler(second);
		expect(first.cancel).not.toHaveBeenCalled();
		expect(second.cancel).toHaveBeenCalledTimes(1);
	});

	it('resets submitting=false after the after-callback is awaited', async () => {
		const s = createSubmitState();
		const handler = s.wrap();
		const after = handler(mockSubmitArgs()) as ReturnType<SubmitFunction>;
		expect(s.submitting).toBe(true);
		const update = vi.fn().mockResolvedValue(undefined);
		if (typeof after === 'function') {
			await after({
				result: { type: 'success', status: 200 },
				update,
				formElement: {} as HTMLFormElement,
				formData: new FormData(),
				action: new URL('http://localhost/?/test')
			});
		}
		expect(s.submitting).toBe(false);
	});

	it('chains the user-provided SubmitFunction (before + after)', async () => {
		const s = createSubmitState();
		const userBefore = vi.fn();
		const userAfter = vi.fn().mockResolvedValue(undefined);
		const inner: SubmitFunction = () => {
			userBefore();
			return userAfter;
		};
		const handler = s.wrap(inner);
		const after = handler(mockSubmitArgs()) as ReturnType<SubmitFunction>;
		expect(userBefore).toHaveBeenCalledTimes(1);
		if (typeof after === 'function') {
			await after({
				result: { type: 'success', status: 200 },
				update: vi.fn().mockResolvedValue(undefined),
				formElement: {} as HTMLFormElement,
				formData: new FormData(),
				action: new URL('http://localhost/?/test')
			});
		}
		expect(userAfter).toHaveBeenCalledTimes(1);
	});

	it('resets submitting=false even if user-provided after-callback throws', async () => {
		const s = createSubmitState();
		const inner: SubmitFunction = () => {
			return async () => {
				throw new Error('user after-callback threw');
			};
		};
		const handler = s.wrap(inner);
		const after = handler(mockSubmitArgs()) as ReturnType<SubmitFunction>;
		expect(s.submitting).toBe(true);
		if (typeof after === 'function') {
			await expect(
				after({
					result: { type: 'success', status: 200 },
					update: vi.fn().mockResolvedValue(undefined),
					formElement: {} as HTMLFormElement,
					formData: new FormData(),
					action: new URL('http://localhost/?/test')
				})
			).rejects.toThrow('user after-callback threw');
		}
		expect(s.submitting).toBe(false);
	});

	it('after second resolved invocation, allows a third (state machine recovers)', async () => {
		const s = createSubmitState();
		const handler = s.wrap();

		// 1st
		const after1 = handler(mockSubmitArgs()) as ReturnType<SubmitFunction>;
		if (typeof after1 === 'function') {
			await after1({
				result: { type: 'success', status: 200 },
				update: vi.fn().mockResolvedValue(undefined),
				formElement: {} as HTMLFormElement,
				formData: new FormData(),
				action: new URL('http://localhost/?/test')
			});
		}
		expect(s.submitting).toBe(false);

		// 2nd OK
		handler(mockSubmitArgs());
		expect(s.submitting).toBe(true);
	});
});
