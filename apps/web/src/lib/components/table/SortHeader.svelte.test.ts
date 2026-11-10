// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SortHeaderHarness from './SortHeaderHarness.test.svelte';

/**
 * デジタル庁「テーブル」ソート機能 + WAI-ARIA APG Sortable Table:
 * - 見出しセル内の button で並び替える
 * - aria-sort は並び替え中の列だけに付ける (ascending / descending)
 * - 状態アイコンは aria-hidden (button の accessible name は列名だけ)
 */
describe('SortHeader', () => {
	it('並び替え中でない列は aria-sort を持たない', () => {
		const { getByRole } = render(SortHeaderHarness, {
			props: { active: false, dir: 'asc', onSort: () => {} }
		});
		expect(getByRole('columnheader').hasAttribute('aria-sort')).toBe(false);
	});

	it('昇順 / 降順の列に aria-sort を付ける', () => {
		const asc = render(SortHeaderHarness, {
			props: { active: true, dir: 'asc', onSort: () => {} }
		});
		expect(asc.getByRole('columnheader').getAttribute('aria-sort')).toBe('ascending');
		asc.unmount();
		const desc = render(SortHeaderHarness, {
			props: { active: true, dir: 'desc', onSort: () => {} }
		});
		expect(desc.getByRole('columnheader').getAttribute('aria-sort')).toBe('descending');
	});

	it('button の名前は列名だけで、 アイコンは読み上げない', () => {
		const { getByRole } = render(SortHeaderHarness, {
			props: { active: false, dir: 'asc', onSort: () => {} }
		});
		const button = getByRole('button', { name: '名前' });
		expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	});

	it('状態ごとにアイコンの形を変える (色や大きさだけで区別しない)', () => {
		const paths = (['none', 'asc', 'desc'] as const).map((state) => {
			const r = render(SortHeaderHarness, {
				props: {
					active: state !== 'none',
					dir: state === 'desc' ? 'desc' : 'asc',
					onSort: () => {}
				}
			});
			const d = r.container.querySelector('path')?.getAttribute('d');
			r.unmount();
			return d;
		});
		expect(new Set(paths).size).toBe(3);
	});

	it('押すと onSort を呼ぶ', async () => {
		const onSort = vi.fn();
		const { getByRole } = render(SortHeaderHarness, {
			props: { active: false, dir: 'asc', onSort }
		});
		await fireEvent.click(getByRole('button', { name: '名前' }));
		expect(onSort).toHaveBeenCalledOnce();
	});

	// デジタル庁「テーブル」: 横方向は左寄せ、 数値は右寄せ。 狭い画面でも見出しを折り返さない。
	it('既定は左寄せで、 見出しを折り返さない', () => {
		const { getByRole } = render(SortHeaderHarness, {
			props: { active: false, dir: 'asc', onSort: () => {} }
		});
		const th = getByRole('columnheader');
		expect(th.classList).toContain('text-left');
		expect(th.classList).toContain('whitespace-nowrap');
	});
});
