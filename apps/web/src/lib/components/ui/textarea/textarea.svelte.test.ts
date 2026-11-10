// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { Textarea } from './index.js';

/**
 * #177-ext: shadcn-svelte 互換の Textarea wrapper。
 * 現状 form では使われていないが、 #197 以降の ProjectDetailView (description 編集) で使う前提で追加。
 */
describe('Textarea (#177-ext)', () => {
	it('renders a textarea element with given value', () => {
		const { container } = render(Textarea, { value: 'hello' });
		const el = container.querySelector('textarea');
		expect(el).not.toBeNull();
		expect(el?.value).toBe('hello');
	});

	it('passes through aria-describedby for accessibility (a11y)', () => {
		const { container } = render(Textarea, { 'aria-describedby': 'help-text' });
		expect(container.querySelector('textarea')?.getAttribute('aria-describedby')).toBe('help-text');
	});

	it('has data-slot="textarea" for shadcn-svelte convention', () => {
		const { container } = render(Textarea);
		expect(container.querySelector('textarea')?.getAttribute('data-slot')).toBe('textarea');
	});

	it('applies merged className (consumer class wins via twMerge)', () => {
		const { container } = render(Textarea, { class: 'min-h-32' });
		const cls = container.querySelector('textarea')?.className ?? '';
		expect(cls).toMatch(/\bmin-h-32\b/);
		expect(cls).not.toMatch(/\bmin-h-16\b/);
	});
});
