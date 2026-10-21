import { readFileSync } from 'node:fs';
import path from 'node:path';

import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

const schemaPreviewPath = path.resolve(
  import.meta.dirname,
  '.svelte-kit/output/prerendered/pages/exam-pack.schema.json',
);

const previewOkStatus = 200;

export default defineConfig({
  plugins: [
    tailwindcss(),
    // Vite preview infers prerendered asset types from the URL suffix and drops route headers.
    {
      configurePreviewServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url?.split('?')[0] !== '/exam-pack.schema.json') {
            next();

            return;
          }

          const schema = readFileSync(schemaPreviewPath);
          response.writeHead(previewOkStatus, {
            'cache-control': 'public, max-age=3600',
            'content-length': schema.byteLength,
            'content-type': 'application/schema+json; charset=utf-8',
          });
          response.end(schema);
        });
      },
      name: 'exam-pack-schema-preview-media-type',
    },
    sveltekit({
      adapter: adapter(),
      compilerOptions: {
        experimental: { async: true },
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/u).includes('node_modules') ? undefined : true,
      },

      experimental: { remoteFunctions: true },

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
