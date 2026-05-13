// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown — basic markdown', () => {
	it('renders bold', () => {
		expect(renderMarkdown('**hello**')).toContain('<strong>hello</strong>');
	});

	it('renders italic', () => {
		expect(renderMarkdown('*hello*')).toContain('<em>hello</em>');
	});

	it('renders unordered list', () => {
		const out = renderMarkdown('- a\n- b');
		expect(out).toContain('<ul>');
		expect(out).toContain('<li>a</li>');
		expect(out).toContain('<li>b</li>');
	});

	it('renders ordered list', () => {
		const out = renderMarkdown('1. a\n2. b');
		expect(out).toContain('<ol>');
	});

	it('renders inline code', () => {
		expect(renderMarkdown('`code`')).toContain('<code>code</code>');
	});

	it('renders code block', () => {
		const out = renderMarkdown('```\ncode\n```');
		expect(out).toContain('<pre>');
		expect(out).toContain('<code>');
	});

	it('renders http link', () => {
		const out = renderMarkdown('[txt](https://example.com)');
		expect(out).toContain('<a href="https://example.com">txt</a>');
	});

	it('renders mailto link', () => {
		const out = renderMarkdown('[mail](mailto:foo@example.com)');
		expect(out).toContain('<a href="mailto:foo@example.com">mail</a>');
	});

	it('renders h2-h4 but not h1 (h1 is page title)', () => {
		expect(renderMarkdown('## h2')).toContain('<h2>');
		expect(renderMarkdown('### h3')).toContain('<h3>');
		expect(renderMarkdown('#### h4')).toContain('<h4>');
		// h1 は ALLOWED_TAGS 外 → DOMPurify が strip
		expect(renderMarkdown('# h1')).not.toContain('<h1>');
	});

	it('renders blockquote', () => {
		expect(renderMarkdown('> quote')).toContain('<blockquote>');
	});

	it('renders hr', () => {
		expect(renderMarkdown('---')).toContain('<hr>');
	});

	it('returns empty string for null / undefined / empty', () => {
		expect(renderMarkdown('')).toBe('');
		expect(renderMarkdown(null)).toBe('');
		expect(renderMarkdown(undefined)).toBe('');
	});
});

describe('renderMarkdown — XSS protection (BP B2 + OWASP)', () => {
	// cure53 / OWASP / CVE で知られた attack vector を網羅
	it.each([
		['<script>alert(1)</script>', /<script/i, 'raw script tag'],
		['[xss](javascript:alert(1))', /javascript:/i, 'javascript: URL in markdown link'],
		['<img src=x onerror=alert(1)>', /<img/i, 'img with onerror (FORBID_TAGS)'],
		['<iframe src="evil"></iframe>', /<iframe/i, 'iframe'],
		['<a href="javascript:alert(1)">x</a>', /javascript:/i, 'javascript: in href'],
		[
			'<a href="data:text/html,<script>alert(1)</script>">x</a>',
			/data:/i,
			'data: URL'
		],
		['<svg><script>alert(1)</script></svg>', /<script/i, 'svg + script'],
		['<style>body{display:none}</style>', /<style/i, 'style tag (FORBID_TAGS)'],
		['<form><input type=submit></form>', /<form|<input/i, 'form + input (FORBID_TAGS)'],
		['<object data="evil"></object>', /<object/i, 'object'],
		['<embed src="evil">', /<embed/i, 'embed'],
		// mXSS template literal pattern (CVE-2025-26791 関連、 SAFE_FOR_TEMPLATES 未使用なので非該当だが防御確認)
		[
			'<math><mtext><table><mglyph><style><a title="</style><img src onerror=alert(1)>">',
			/onerror/i,
			'mXSS template literal pattern'
		]
	])('strips %s — %s', (input, forbidden, description) => {
		expect(description).toBeTruthy(); // タイトル用に渡しているだけ、 ESLint 不要 var 警告回避
		expect(renderMarkdown(input)).not.toMatch(forbidden);
	});

	it('strips event handler attribute on allowed tag', () => {
		const out = renderMarkdown('<a href="https://example.com" onclick="alert(1)">x</a>');
		expect(out).not.toMatch(/onclick/i);
		expect(out).toMatch(/href="https:\/\/example\.com"/);
	});

	it('strips style attribute on allowed tag', () => {
		const out = renderMarkdown('<p style="background:url(javascript:alert(1))">hi</p>');
		expect(out).not.toMatch(/style=/i);
		expect(out).toContain('<p>');
	});
});

describe('renderMarkdown — GFM features', () => {
	it('renders strikethrough', () => {
		expect(renderMarkdown('~~del~~')).toContain('<del>del</del>');
	});

	it('renders table', () => {
		const md = '| h1 | h2 |\n|----|----|\n| a  | b  |';
		const out = renderMarkdown(md);
		expect(out).toContain('<table>');
		expect(out).toContain('<th>h1</th>');
		expect(out).toContain('<td>a</td>');
	});

	it('strips task list <input> (FORBID_TAGS)', () => {
		const out = renderMarkdown('- [x] done\n- [ ] todo');
		// FORBID_TAGS で <input> は除外、 ただし周りの list 構造 / text は残る
		expect(out).not.toMatch(/<input/i);
		expect(out).toContain('<li>');
	});

	it('autolinks bare URL (GFM)', () => {
		const out = renderMarkdown('see https://example.com for details');
		expect(out).toContain('<a href="https://example.com">https://example.com</a>');
	});
});
