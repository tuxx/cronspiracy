import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	ssr: { external: ['node:sqlite'] },
	test: { include: ['src/**/*.test.ts'] }
});
