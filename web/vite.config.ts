/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// SvelteKit の `$env/dynamic/private` は plugin 初期化時に process.env を snapshot するため、
// vitest 起動時には既に固定されている。test 専用のダミー値を SvelteKit plugin より先に注入する。
if (process.env.VITEST) {
	process.env.DYNAMODB_TABLE = process.env.DYNAMODB_TABLE ?? 'resource-planner-test';
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'node'
	}
});
