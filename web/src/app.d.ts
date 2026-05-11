import type { Locale } from '$lib/i18n/index.svelte';
import type { Theme } from '$lib/theme';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			locale: Locale;
			theme: Theme;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
