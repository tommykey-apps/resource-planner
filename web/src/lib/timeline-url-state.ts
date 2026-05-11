import type { ZoomLevel } from '@tommykey-apps/ui-components';
import { ZOOMS } from '@tommykey-apps/ui-components';
import { formatLocalDate, parseLocalDate } from './date';

/**
 * Timeline viewport / zoom と URL query の双方向変換 (#99 item 2)。
 *
 * 採用するクエリパラメータ:
 *   - `d`: viewport 開始日 (YYYY-MM-DD、ローカル日付として解釈)
 *   - `z`: zoom level id (`day` / `week` / `month` / `year`)
 *
 * 無効値や欠落は null を返し、呼び出し側で default にフォールバックする (純粋関数、テスト容易)。
 */

export type ZoomId = keyof typeof ZOOMS;

const VALID_ZOOM_IDS = Object.keys(ZOOMS) as ZoomId[];

function isZoomId(v: string): v is ZoomId {
	return (VALID_ZOOM_IDS as string[]).includes(v);
}

/**
 * URLSearchParams から viewport 開始日 + zoom を抽出。
 * - `d` が YYYY-MM-DD でないなら viewportStart=null
 * - `z` が有効な zoom id でないなら zoom=null
 */
export function parseTimelineParams(params: URLSearchParams): {
	viewportStart: Date | null;
	zoom: ZoomLevel | null;
} {
	const d = params.get('d');
	const z = params.get('z');

	let viewportStart: Date | null = null;
	if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
		const parsed = parseLocalDate(d);
		if (!Number.isNaN(parsed.getTime())) viewportStart = parsed;
	}

	let zoom: ZoomLevel | null = null;
	if (z && isZoomId(z)) zoom = ZOOMS[z];

	return { viewportStart, zoom };
}

/**
 * viewport / zoom 状態から `?d=...&z=...` 形式のクエリ文字列を生成。
 * その他既存パラメータは保持するため呼び出し側で URLSearchParams をマージすること。
 */
export function buildTimelineSearch(state: { viewportStart: Date; zoom: ZoomLevel }): string {
	const params = new URLSearchParams();
	params.set('d', formatLocalDate(state.viewportStart));
	params.set('z', state.zoom.id);
	return params.toString();
}

/**
 * 既存 URL の他クエリは保持しつつ `d` / `z` を反映した URL を返す純粋関数。
 * `$effect` から goto() に渡すための補助。
 */
export function applyTimelineParams(
	url: URL,
	state: { viewportStart: Date; zoom: ZoomLevel }
): URL {
	const next = new URL(url.toString());
	next.searchParams.set('d', formatLocalDate(state.viewportStart));
	next.searchParams.set('z', state.zoom.id);
	return next;
}
