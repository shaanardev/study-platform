import { defineConfig } from 'oxlint';
import type { OxlintConfig } from 'oxlint';
import core from 'ultracite/oxlint/core';
import vitest from 'ultracite/oxlint/vitest';

const config: OxlintConfig = defineConfig({
  extends: [core, vitest],
  ignorePatterns: ['.local/**', 'packs/**', 'plugins/**', '.codex/**', '.agents/**'],
  options: { typeAware: true },
  overrides: [
    {
      env: { node: true },
      files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}', '**/*.svelte.{js,ts}'],
    },
    {
      env: { browser: true, svelte: true },
      files: ['apps/web/src/**/*.svelte', 'apps/web/src/**/*.svelte.{js,ts}'],
    },
  ],
  rules: {
    'import/no-cycle': 'error',
    'import/no-self-import': 'error',
    'no-unused-vars': [
      'error',
      {
        args: 'all',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
  },
});

export default config;
