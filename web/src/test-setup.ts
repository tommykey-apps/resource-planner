/**
 * Vitest setup file。
 * - `@testing-library/jest-dom` の matcher を Vitest に拡張 (`.toBeDisabled()` 等)
 * - 各 component test ファイル先頭に `// @vitest-environment jsdom` directive を付けて jsdom 化
 */
import '@testing-library/jest-dom/vitest';
