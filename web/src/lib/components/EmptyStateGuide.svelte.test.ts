// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import EmptyStateGuide from './EmptyStateGuide.svelte';

/**
 * #99 item 3: 「① 人を追加 ② 案件を追加 ③ アサインを作成」 の 3 step chip 表示。
 *
 * 4 状態 + 完了 (隠す) を確認:
 *   - 両方空: 1 / 2 / 3 すべて未完
 *   - resource のみ空: 2 だけ ✓
 *   - project のみ空: 1 だけ ✓
 *   - resource + project あり、assignment 空: 1 / 2 ✓、3 だけ未完
 *   - すべてあり: 描画自体しない (null)
 */
function renderGuide(counts: {
	resourceCount: number;
	projectCount: number;
	assignmentCount: number;
}) {
	return render(EmptyStateGuide, { props: counts });
}

describe('EmptyStateGuide (#99 item 3)', () => {
	it('all three steps incomplete when everything is empty', () => {
		const { getByTestId } = renderGuide({
			resourceCount: 0,
			projectCount: 0,
			assignmentCount: 0
		});
		expect(getByTestId('empty-step-1').getAttribute('data-done')).toBe('false');
		expect(getByTestId('empty-step-2').getAttribute('data-done')).toBe('false');
		expect(getByTestId('empty-step-3').getAttribute('data-done')).toBe('false');
	});

	it('marks step 1 done when at least one resource exists', () => {
		const { getByTestId } = renderGuide({
			resourceCount: 1,
			projectCount: 0,
			assignmentCount: 0
		});
		expect(getByTestId('empty-step-1').getAttribute('data-done')).toBe('true');
		expect(getByTestId('empty-step-2').getAttribute('data-done')).toBe('false');
		expect(getByTestId('empty-step-3').getAttribute('data-done')).toBe('false');
	});

	it('marks step 2 done when at least one project exists', () => {
		const { getByTestId } = renderGuide({
			resourceCount: 0,
			projectCount: 1,
			assignmentCount: 0
		});
		expect(getByTestId('empty-step-1').getAttribute('data-done')).toBe('false');
		expect(getByTestId('empty-step-2').getAttribute('data-done')).toBe('true');
		expect(getByTestId('empty-step-3').getAttribute('data-done')).toBe('false');
	});

	it('marks steps 1 and 2 done when both resource and project exist but no assignment', () => {
		const { getByTestId } = renderGuide({
			resourceCount: 2,
			projectCount: 3,
			assignmentCount: 0
		});
		expect(getByTestId('empty-step-1').getAttribute('data-done')).toBe('true');
		expect(getByTestId('empty-step-2').getAttribute('data-done')).toBe('true');
		expect(getByTestId('empty-step-3').getAttribute('data-done')).toBe('false');
	});

	it('renders nothing when all three steps are complete (guide is dismissed)', () => {
		const { container } = renderGuide({
			resourceCount: 1,
			projectCount: 1,
			assignmentCount: 1
		});
		// no chip rendered
		expect(container.querySelector('[data-testid^="empty-step-"]')).toBeNull();
	});
});
