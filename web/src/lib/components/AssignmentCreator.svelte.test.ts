// @vitest-environment jsdom
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AssignmentCreator from './AssignmentCreator.svelte';

describe('AssignmentCreator (smoke)', () => {
	it('renders the trigger button', () => {
		const { getByRole } = render(AssignmentCreator, {
			props: { resources: [], projects: [] }
		});
		expect(getByRole('button', { name: /アサイン/ })).toBeInTheDocument();
	});

	it('shows phosphor Plus icon (#105)', () => {
		const { getByRole } = render(AssignmentCreator, {
			props: { resources: [], projects: [] }
		});
		const trigger = getByRole('button');
		const icon = trigger.querySelector('svg[aria-hidden="true"]');
		expect(icon).toBeTruthy();
		// プレーンな "+" 文字も使わない (text node の plus)
		expect(trigger.textContent?.replace(/アサインを追加/, '').trim()).not.toContain('+');
	});

	// header 標準化: ページ本文に置くので幅に余裕がある。 狭い画面でもラベルを隠さず accessible name を保つ。
	it('ラベルを画面幅で隠さない', () => {
		const { getByRole } = render(AssignmentCreator, {
			props: { resources: [], projects: [] }
		});
		expect(getByRole('button').querySelector('.hidden')).toBeNull();
	});

	// / と /assignments の両方に置くので、 action は / の絶対パスで送る。
	it('作成 form は /?/createAssignment に送る', async () => {
		const { getByRole } = render(AssignmentCreator, {
			props: {
				resources: [{ id: 'r1', name: 'Alice' }],
				projects: [{ id: 'p1', name: 'Project A', color: '#0EA5E9' }]
			}
		});
		await fireEvent.click(getByRole('button', { name: /アサインを追加/ }));
		const form = await waitFor(() => {
			const f = document.querySelector('form[action="/?/createAssignment"]');
			if (!f) throw new Error('createAssignment form not rendered');
			return f;
		});
		expect(form).toBeTruthy();
	});
});
