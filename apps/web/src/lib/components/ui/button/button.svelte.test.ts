// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { buttonVariants } from './button.svelte';
import { Button } from './index.js';

/**
 * #124: shadcn Button を hover した時に pointer cursor が出るよう class に `cursor-pointer` を含める。
 * disabled 時は `cursor-not-allowed` で意味的に分ける (現状 disabled は `pointer-events: none` で
 * hover 自体無効化されるが、コンテキストメニュー等で visible になる時のために慣例を守る)。
 *
 * children prop は Snippet 型を要求するので、test は `buttonVariants` ヘルパで生成した
 * class string を直接 assert する (render は 1 ケースだけ smoke として残す)。
 */
describe('Button cursor (#124)', () => {
	it('base class includes cursor-pointer', () => {
		expect(buttonVariants()).toMatch(/\bcursor-pointer\b/);
	});

	it('base class includes disabled:cursor-not-allowed', () => {
		expect(buttonVariants()).toMatch(/disabled:cursor-not-allowed/);
	});

	it('outline variant also has cursor-pointer (inherited from base)', () => {
		expect(buttonVariants({ variant: 'outline' })).toMatch(/\bcursor-pointer\b/);
	});

	it('destructive variant also has cursor-pointer (inherited from base)', () => {
		expect(buttonVariants({ variant: 'destructive' })).toMatch(/\bcursor-pointer\b/);
	});

	it('rendered Button DOM has cursor-pointer class (smoke)', () => {
		const { getByRole } = render(Button);
		expect(getByRole('button').className).toMatch(/\bcursor-pointer\b/);
	});
});
