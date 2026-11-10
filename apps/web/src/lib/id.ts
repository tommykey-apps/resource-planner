import { ulid } from 'ulid';

/**
 * 新規 entity の id 生成。
 *
 * ULID 採用理由 (ADR 0002):
 * - 時系列 sortable (Crockford Base32、先頭 10 文字が timestamp)
 * - URL-safe (英数のみ、case-insensitive)
 * - 衝突確率は UUIDv4 同等 (80 bit ランダム部)
 * - SK にそのまま埋めると debug 時に作成順がわかる
 */
export const newId = (): string => ulid();
