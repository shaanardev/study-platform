import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['apps/pack-cli/src/**/*.ts', 'apps/web/src/**/*.{ts,svelte}'],
      thresholds: { lines: 70 },
    },
    projects: ['./apps/pack-cli/vitest.config.ts', './apps/web/vite.config.ts'],
  },
});
