// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { Input } from './index.js';

/**
 * #177-ext: shadcn-svelte 互換の Input wrapper。
 * 既存 4 form の hardcode `<input>` を統一する用途。
 *
 * テスト戦略: button.svelte.test.ts と同じく render の smoke + 主要 prop pass-through。
 * value は $bindable なので、 render 時に渡せば DOM の value 属性に反映される。
 */
describe('Input (#177-ext)', () => {
	it('renders an input element with given value', () => {
		const { container } = render(Input, { value: 'hello' });
		const el = container.querySelector('input');
		expect(el).not.toBeNull();
		expect(el?.value).toBe('hello');
	});

	it('passes through aria-describedby for accessibility (a11y)', () => {
		const { container } = render(Input, { 'aria-describedby': 'help-text' });
		expect(container.querySelector('input')?.getAttribute('aria-describedby')).toBe('help-text');
	});

	it('uses type="text" by default (HTML default) and supports type="date"', () => {
		const { container } = render(Input, { type: 'date' });
		expect(container.querySelector('input')?.getAttribute('type')).toBe('date');
	});

	it('has data-slot="input" for shadcn-svelte convention', () => {
		const { container } = render(Input);
		expect(container.querySelector('input')?.getAttribute('data-slot')).toBe('input');
	});

	it('applies merged className (consumer class wins via twMerge)', () => {
		const { container } = render(Input, { class: 'w-32' });
		const cls = container.querySelector('input')?.className ?? '';
		// consumer の w-32 が baseClass の w-full に勝つ (tailwind-merge)
		expect(cls).toMatch(/\bw-32\b/);
		expect(cls).not.toMatch(/\bw-full\b/);
	});
});
