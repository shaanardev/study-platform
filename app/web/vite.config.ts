import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: adapter(),
      compilerOptions: {
        experimental: { async: true },
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/u).includes('node_modules') ? undefined : true,
      },

      // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
      // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
      // See https://svelte.dev/docs/kit/adapters for more information about adapters.
    }),
  ],
  root: import.meta.dirname,
  test: {
    expect: { requireAssertions: true },
    name: 'web',
    projects: [
      {
        resolve: { conditions: ['browser'] },
        test: {
          environment: 'jsdom',
          exclude: ['src/lib/server/**'],
          include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
          name: 'client',
        },
      },

      {
        test: {
          environment: 'node',
          exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
          include: ['src/**/*.{test,spec}.{js,ts}'],
          name: 'server',
        },
      },
    ],
  },
});
