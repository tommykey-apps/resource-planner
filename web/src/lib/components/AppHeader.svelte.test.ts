// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AppHeader from './AppHeader.svelte';
import type { Resource, Project, Assignment } from '$lib/types';

/**
 * #136 / #146: 共通 Header の振る舞い契約。
 *
 * AppHeader は `/` と `/assignments` から共通で mount する。 子コンポーネントの内部は
 * 個別 spec があるので、本ファイルは AppHeader 固有の責務 (logo a11y / branding nav /
 * active state / 子の mount + user.email pass-through) だけを TDD で守る。
 */

const SAMPLE_RESOURCES: Resource[] = [{ id: 'r1', name: 'Alice' }];
const SAMPLE_PROJECTS: Project[] = [{ id: 'p1', name: 'Project A', color: '#0EA5E9' }];
const SAMPLE_ASSIGNMENTS: Assignment[] = [
	{
		id: 'a1',
		resourceId: 'r1',
		projectId: 'p1',
		startDate: '2026-05-01',
		endDateExclusive: '2026-05-08'
	}
];

type StubOverrides = { isAssignmentsActive?: boolean; email?: string; csrfToken?: string };

const stubProps = (overrides: StubOverrides = {}) => ({
	props: {
		resources: SAMPLE_RESOURCES,
		projects: SAMPLE_PROJECTS,
		assignments: SAMPLE_ASSIGNMENTS,
		user: { email: overrides.email ?? 'alice@example.com' },
		isAssignmentsActive: overrides.isAssignmentsActive ?? false,
		csrfToken: overrides.csrfToken ?? 'test-csrf-token'
	}
});

describe('AppHeader — branding logo (#146)', () => {
	it('logo img は alt="" (隣 h1 と同じ意味なので装飾扱い、 SR 重複読み回避)', () => {
		const { container } = render(AppHeader, stubProps());
		const img = container.querySelector('img');
		expect(img).toBeTruthy();
		expect(img?.getAttribute('alt')).toBe('');
	});

	it('logo img は width / height 属性で CLS 防止 (Core Web Vitals)', () => {
		const { container } = render(AppHeader, stubProps());
		const img = container.querySelector('img');
		expect(img?.getAttribute('width')).toBe('32');
		expect(img?.getAttribute('height')).toBe('32');
	});

	it('logo + アプリ名 h1 は <a href="/"> で wrap して home へ navigation', () => {
		const { container } = render(AppHeader, stubProps());
		const anchor = container.querySelector('a[href="/"]');
		expect(anchor).toBeTruthy();
		expect(anchor?.querySelector('img')).toBeTruthy();
		expect(anchor?.querySelector('h1')).toBeTruthy();
	});
});

describe('AppHeader — assignments link active state (#136)', () => {
	it('isAssignmentsActive=false → /assignments link に aria-current 無し', () => {
		const { container } = render(AppHeader, stubProps({ isAssignmentsActive: false }));
		const link = container.querySelector('a[href="/assignments"]');
		expect(link).toBeTruthy();
		expect(link?.getAttribute('aria-current')).toBeNull();
	});

	it('isAssignmentsActive=true → /assignments link に aria-current="page"', () => {
		const { container } = render(AppHeader, stubProps({ isAssignmentsActive: true }));
		const link = container.querySelector('a[href="/assignments"]');
		expect(link?.getAttribute('aria-current')).toBe('page');
	});
});

describe('AppHeader — child component composition (#136)', () => {
	it('AvatarDropdown は user.email を受け取り、 trigger に email 先頭文字を表示', () => {
		const { container } = render(AppHeader, stubProps({ email: 'bob@example.com' }));
		const avatar = container.querySelector(
			'button[aria-label*="bob@example.com"]'
		) as HTMLButtonElement | null;
		expect(avatar).toBeTruthy();
		expect(avatar?.textContent?.trim()).toBe('B');
	});

	it('header 内に sticky bar が 1 つだけ (重複 header を防ぐ)', () => {
		const { container } = render(AppHeader, stubProps());
		const headers = container.querySelectorAll('header');
		expect(headers.length).toBe(1);
	});

	// #166 csrfToken pass-through の assert は AvatarDropdown / SignOutForm 層へ委譲。
	// bits-ui DropdownMenu.Portal は trigger click 前に Content を render しないため
	// AppHeader 単体テストでは hidden input を直接 DOM から拾えない。 SignOutForm.test
	// が hidden csrfToken の存在 / 値を guard、 E2E spec が flow 全体を guard する。
});
