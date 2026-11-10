import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

// BP B3: marked v18 は sync が default、 TS 型は `string | Promise<string>` union で
// 返るため `{ async: false }` 明示 + `as string` cast で narrow。
marked.use({ gfm: true, breaks: true, async: false });

// DOMPurify は allow-list (= ALLOWED_TAGS / ALLOWED_ATTR) を明示すれば、 そこに無い tag / attr は
// 自動的に strip される (cure53 公式の deny-by-default semantics)。 よって以下の設定は冗長な
// FORBID_TAGS / FORBID_ATTR を持たず、 allow-list だけで XSS を遮断する。
// - h1 解禁 (#224): GitHub Issues / Notion / Discourse / Linear / Confluence 等 rich content
//   editor 系の業界 main stream に追随。 axe-core 4.10.2 で実 audit したところ、 multi-h1 は
//   そもそも violation すら出ない (axe の heading 系 rule は empty-heading / heading-order /
//   page-has-heading-one (少なくとも 1 つ) / p-as-heading のみで、 「single h1 per page」 を
//   flag する rule は存在しない。 Lighthouse a11y は axe を内部利用するので同じ)。 WCAG 2.1/2.2
//   公式にも multi-h1 制限なし。 HTML5 Outline 仕様 (h1 を section 内で自由に使う案) は
//   browser / AT 未実装で実質廃止。
// - img / style / iframe / script / svg / form / input 等は allow-list 不在で自動 strip される
// - onclick / onerror / onload / formaction 等の event handler は ALLOWED_ATTR 不在で自動 strip
// - SAFE_FOR_TEMPLATES は使わない (CVE-2025-26791 発火条件、 BP B2)
// - ALLOWED_URI_REGEXP で javascript: / data: scheme を遮断 (cure53 demo 標準)
// ref: https://github.com/cure53/DOMPurify/wiki/Default-TAGs-ATTRIBUTEs-allow-list-&-blocklist
const SANITIZE_CONFIG = {
	ALLOWED_TAGS: [
		'p',
		'br',
		'strong',
		'em',
		'del',
		'code',
		'pre',
		'h1',
		'h2',
		'h3',
		'h4',
		'ul',
		'ol',
		'li',
		'blockquote',
		'hr',
		'a',
		'table',
		'thead',
		'tbody',
		'tr',
		'th',
		'td'
	],
	ALLOWED_ATTR: ['href', 'title'],
	ALLOW_DATA_ATTR: false,
	ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i
};

/**
 * markdown を sanitize 済 HTML 文字列に変換 (ADR 0010)。
 *
 * - `isomorphic-dompurify` で SSR / CSR / vitest jsdom 全環境で動作 (BP B4)
 * - marked v18 sync API + DOMPurify config の二段で XSS / mXSS を防ぐ (BP B2 / B3)
 * - CSP (PR-N0) と合わせて二段防御
 */
export function renderMarkdown(input: string | null | undefined): string {
	if (!input) return '';
	// marked v14+ で `{ async: false }` のオーバーロードが string を返すと型確定 (PR #3341)、
	// `as string` cast 不要。 将来 async: true が混入したら型 error で気づける。
	const rawHtml = marked.parse(input, { async: false });
	return DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG);
}
