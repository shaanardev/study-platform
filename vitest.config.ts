import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      // Svelte UI behavior is exercised in Playwright; Vitest coverage stays with unit-testable modules.
      exclude: ['app/web/**/*.svelte'],
      include: ['app/pack-cli/src/**/*.ts', 'app/web/src/**/*.ts'],
      thresholds: { lines: 70 },
    },
    projects: ['./app/pack-cli/vitest.config.ts', './app/web/vite.config.ts'],
  },
});
