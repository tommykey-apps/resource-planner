/**
 * Zod schema の barrel (#226)。 entity 単位ファイルに分割し、 caller は従来通り
 * `$lib/schemas` で import する (公開 API は分割前と同一)。
 *
 * 共有 primitive (`dateString` / `colorString`) は `./shared` に置き、 sibling ファイルが
 * 直接 import する。 barrel には公開対象 (`deleteByIdSchema`) のみ再エクスポートして
 * 公開面を分割前と揃える。
 */
export { deleteByIdSchema } from './shared';
export * from './resource';
export * from './project';
export * from './assignment';
