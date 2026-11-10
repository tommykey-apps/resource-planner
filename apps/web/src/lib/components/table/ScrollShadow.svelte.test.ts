// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import ScrollShadowHarness from './ScrollShadowHarness.test.svelte';

/**
 * デジタル庁「テーブル」モバイル表示: 表の領域内で横スクロールし、 シャドーで示す
 * (公式 scroll-shadow.js を Svelte 部品に移植)。
 * キーボードだけでスクロールできるよう、 領域を focus 可能にして名前を付ける
 * (Adrian Roselli "Under-Engineered Responsive Tables": role=region + aria-labelledby + tabindex=0)。
 */
// jsdom は ResizeObserver を実装していないので最小の stub を置く。
beforeAll(() => {
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			disconnect() {}
		}
	);
});

describe('ScrollShadow', () => {
	it('focus でき、 見出しを名前に持つ region になる', () => {
		const { getByRole } = render(ScrollShadowHarness);
		const region = getByRole('region', { name: 'メンバー' });
		expect(region.getAttribute('tabindex')).toBe('0');
		expect(region.querySelector('table')).not.toBeNull();
	});

	it('シャドーは装飾なので読み上げない', () => {
		const { getByRole } = render(ScrollShadowHarness);
		const shadows = getByRole('region').querySelectorAll('[data-scroll-shadow]');
		expect(shadows).toHaveLength(2);
		for (const s of shadows) expect(s.getAttribute('aria-hidden')).toBe('true');
	});
});
