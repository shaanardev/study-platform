import { defineConfig } from 'oxlint';
import type { OxlintConfig } from 'oxlint';
import core from 'ultracite/oxlint/core';
import vitest from 'ultracite/oxlint/vitest';

const customVitestRules = {
  ...vitest,
  ...(vitest.overrides === undefined
    ? {}
    : {
        overrides: vitest.overrides.map((override) => ({
          ...override,
          rules: {
            ...override.rules,
            'vitest/no-conditional-in-test': 'error',
          } satisfies typeof override.rules,
        })),
      }),
};

const config: OxlintConfig = defineConfig({
  extends: [core, customVitestRules],
  ignorePatterns: ['.local/**', 'packs/**', 'plugins/**', '.codex/**', '.agents/**'],
  options: { typeAware: true, typeCheck: true },
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
  plugins: [...(core.plugins ?? []), ...(vitest.plugins ?? []), 'effecttsgo'],
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
