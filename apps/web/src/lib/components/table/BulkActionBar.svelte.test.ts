// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import BulkActionBarHarness from './BulkActionBarHarness.test.svelte';

/**
 * Carbon Data table batch actions: 1 行でも選ぶと表の上にバーを出し、 選択件数・一括操作・
 * 右端の取り消し (選択を解除) を置く。 件数の変化は読み上げる (aria-live)。
 */
describe('BulkActionBar', () => {
	it('0 件なら出さない', () => {
		const { queryByRole } = render(BulkActionBarHarness, {
			props: { count: 0, onClear: () => {} }
		});
		expect(queryByRole('region', { name: '一括操作' })).toBeNull();
	});

	it('件数・操作・選択を解除を出す', () => {
		const { getByRole, getByText } = render(BulkActionBarHarness, {
			props: { count: 3, onClear: () => {} }
		});
		const bar = getByRole('region', { name: '一括操作' });
		expect(getByText('3 件を選択中', { selector: 'span' })).toBeInTheDocument();
		expect(bar.querySelector('[data-testid="action"]')).not.toBeNull();
	});

	// live region は内容が変わる前から DOM にある必要がある (後から挿入した live region は読み上げられないことがある)。
	it('件数を読み上げる live region は 0 件のときから置いておく', async () => {
		const r = render(BulkActionBarHarness, { props: { count: 0, onClear: () => {} } });
		const live = r.container.querySelector('[aria-live="polite"]');
		expect(live).not.toBeNull();
		expect(live?.textContent?.trim()).toBe('');
		await r.rerender({ count: 2, onClear: () => {} });
		expect(live?.textContent?.trim()).toBe('2 件を選択中');
	});

	it('選択を解除で onClear を呼ぶ', async () => {
		const onClear = vi.fn();
		const { getByRole } = render(BulkActionBarHarness, { props: { count: 1, onClear } });
		await fireEvent.click(getByRole('button', { name: '選択を解除' }));
		expect(onClear).toHaveBeenCalledOnce();
	});
});
