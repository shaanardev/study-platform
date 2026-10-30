import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      // Route handlers are exercised in Playwright's separate server process, not by Vitest coverage.
      exclude: [
        'app/web/**/*.svelte',
        'app/web/src/routes/**/*.remote.ts',
        'app/web/src/routes/**/+server.ts',
      ],
      include: ['app/pack-cli/src/**/*.ts', 'app/web/src/**/*.ts'],
      thresholds: { branches: 70, lines: 70 },
    },
    projects: ['./app/pack-cli/vitest.config.ts', './app/web/vite.config.ts'],
  },
});
