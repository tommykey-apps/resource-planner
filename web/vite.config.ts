/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vite';

// SvelteKit の `$env/dynamic/private` は plugin 初期化時に process.env を snapshot するため、
// vitest 起動時には既に固定されている。test 専用のダミー値を SvelteKit plugin より先に注入する。
if (process.env.VITEST) {
	process.env.DYNAMODB_TABLE = process.env.DYNAMODB_TABLE ?? 'resource-planner-test';
	process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret-not-for-production';
	process.env.ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN ?? 'example.com';
	process.env.EMAIL_FROM = process.env.EMAIL_FROM ?? 'noreply@example.com';
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		// 2 種類の test を分離 (#94):
		// - unit: node 環境、Auth.js / SvelteKit server module を直接 import
		// - component: jsdom + browser resolve conditions、Svelte 5 component を mount
		// `svelteTesting()` は browser conditions を要求するので、それが不要な node test に
		// 影響しないよう projects で隔離する。
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					environment: 'node',
					setupFiles: ['./src/test-setup.ts']
				}
			},
			{
				extends: true,
				plugins: [svelteTesting()],
				test: {
					name: 'component',
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					environment: 'jsdom',
					setupFiles: ['./src/test-setup.ts']
				}
			}
		]
	}
});
