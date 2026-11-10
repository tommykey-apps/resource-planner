import type { Project } from '@resource-planner/db/entities';

/**
 * SSR render 済の Project (ADR 0010、 PR-N4)。
 *
 * `+layout.server.ts` の load が `renderMarkdown(p.description)` を呼び、 `descriptionHtml` を
 * sanitize 済 HTML 文字列として付与する。 client 側は `{@html descriptionHtml}` で表示するだけ。
 *
 * 理由 (ADR 0010 Decision):
 * - `$effect` 内の `await import('marked')` は SSR で走らないため、 lazy load だと初回描画で
 *   description が空になる
 * - SSR で render すれば初回 modal open 時点で markdown が即見える (lazy await なし)
 */
export interface ProjectWithRenderedDescription extends Project {
	/** server 側 sanitize 済 HTML 文字列 (description なしの project は空文字 `''`)。 */
	descriptionHtml: string;
}
