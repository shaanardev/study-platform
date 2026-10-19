import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['app/pack-cli/src/**/*.ts', 'app/web/src/**/*.{ts,svelte}'],
      thresholds: { lines: 70 },
    },
    projects: ['./app/pack-cli/vitest.config.ts', './app/web/vite.config.ts'],
  },
});
