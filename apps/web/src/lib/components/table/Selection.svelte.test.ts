// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SelectionHarness from './SelectionHarness.test.svelte';

/**
 * デジタル庁「テーブル」チェックボックスを持つテーブル:
 * - 行のチェックボックスは aria-labelledby で行の名前を指す
 * - 全選択は thead に置き、 名前「行を選択」 + 説明「すべての行を選択する」
 * - 一部だけ選択中は indeterminate (マイナス表示)
 */
const props = (over = {}) => ({
	props: {
		state: 'none' as const,
		checked: false,
		onToggleAll: () => {},
		onToggle: () => {},
		...over
	}
});

describe('SelectAllHeader / RowSelectCell', () => {
	// 公式例の aria-description は WAI-ARIA 1.3 草案の属性なので、 確定済み (1.2) の aria-describedby で
	// 同じ説明を付ける。
	it('全選択のチェックボックスは名前「行を選択」と説明「すべての行を選択する」を持つ', () => {
		const { getByRole } = render(SelectionHarness, props());
		const all = getByRole('checkbox', { name: '行を選択' });
		expect(all).toHaveAccessibleDescription('すべての行を選択する');
		expect(all.closest('thead')).not.toBeNull();
	});

	it('行のチェックボックスの名前は行の名前', () => {
		const { getByRole } = render(SelectionHarness, props());
		expect(getByRole('checkbox', { name: '佐藤' })).toBeInTheDocument();
	});

	it('一部選択中は indeterminate、 全部なら checked', () => {
		const some = render(SelectionHarness, props({ state: 'some' }));
		const a = some.getByRole('checkbox', { name: '行を選択' }) as HTMLInputElement;
		expect(a.indeterminate).toBe(true);
		expect(a.checked).toBe(false);
		some.unmount();
		const all = render(SelectionHarness, props({ state: 'all' }));
		const b = all.getByRole('checkbox', { name: '行を選択' }) as HTMLInputElement;
		expect(b.indeterminate).toBe(false);
		expect(b.checked).toBe(true);
	});

	it('押すとそれぞれの onToggle を呼ぶ', async () => {
		const onToggleAll = vi.fn();
		const onToggle = vi.fn();
		const { getByRole } = render(SelectionHarness, props({ onToggleAll, onToggle }));
		await fireEvent.click(getByRole('checkbox', { name: '行を選択' }));
		await fireEvent.click(getByRole('checkbox', { name: '佐藤' }));
		expect(onToggleAll).toHaveBeenCalledOnce();
		expect(onToggle).toHaveBeenCalledOnce();
	});
});
