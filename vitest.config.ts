import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      // Route components are exercised in Playwright; Vitest coverage stays with unit-testable modules.
      exclude: ['app/web/src/routes/**/*.svelte'],
      include: ['app/pack-cli/src/**/*.ts', 'app/web/src/**/*.{ts,svelte}'],
      thresholds: { lines: 70 },
    },
    projects: ['./app/pack-cli/vitest.config.ts', './app/web/vite.config.ts'],
  },
});
