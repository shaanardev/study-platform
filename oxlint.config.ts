import { defineConfig } from 'oxlint';
import type { OxlintConfig } from 'oxlint';
import antiSlop from 'ultracite/oxlint/anti-slop';
import core from 'ultracite/oxlint/core';
import vitest from 'ultracite/oxlint/vitest';

import { projectJsPlugins } from './tooling/oxlint-plugin/index.ts';

const customVitestRules = { ...vitest };

if (vitest.overrides !== undefined) {
  customVitestRules.overrides = vitest.overrides.map((override) => ({
    ...override,
    rules: {
      ...override.rules,
      'vitest/no-conditional-in-test': 'error',
    } satisfies typeof override.rules,
  }));
}

const config: OxlintConfig = defineConfig({
  // These rules cover linted JS/TS files across the monorepo, subject to ignores and narrower overrides.
  extends: [core, customVitestRules, antiSlop],
  ignorePatterns: ['.local/**', 'packs/**', 'plugins/**', '.codex/**', '.agents/**'],
  jsPlugins: projectJsPlugins,
  options: { reportUnusedDisableDirectives: 'error', typeAware: true, typeCheck: true },
  overrides: [
    {
      files: ['app/web/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                message: 'Use only the Schema module from Effect in the SvelteKit app.',
                name: 'effect',
              },
            ],
            patterns: [
              {
                group: ['effect/**', '!effect/Schema'],
                message: 'Use only effect/Schema from the Effect package in the SvelteKit app.',
              },
            ],
          },
        ],
      },
    },
    {
      env: { node: true },
      files: ['app/**', 'scripts/**', 'tooling/**', '*.config.ts'],
    },
    {
      env: { browser: true, svelte: true },
      files: ['app/web/src/**/*.svelte', 'app/web/src/**/*.svelte.{js,ts}'],
    },
    {
      files: ['app/web/src/**'],
      rules: { 'node/no-process-env': 'error' },
    },
    {
      files: ['**/*.test.*', '**/*.spec.*', 'app/pack-cli/test/**'],
      rules: { 'no-magic-numbers': 'off' },
    },
  ],
  plugins: [...(core.plugins ?? []), ...(vitest.plugins ?? []), 'effecttsgo'],
  rules: {
    // Workspace-wide rules apply to both apps, scripts, and tooling.
    'anti-slop/no-array-filter-map': 'error',
    'import/no-cycle': 'error',
    'import/no-self-import': 'error',
    'no-magic-numbers': [
      'error',
      {
        detectObjects: false,
        ignore: [-1, 0, 1],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
        ignoreEnums: true,
        ignoreNumericLiteralTypes: true,
        ignoreTypeIndexes: true,
      },
    ],
    'no-unused-vars': [
      'error',
      {
        args: 'all',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
    'project/no-for-of': 'error',
    'typescript/no-unnecessary-condition': ['error', { allowConstantLoopConditions: 'always' }],
    'typescript/prefer-for-of': 'off',
    'unicorn/no-array-for-each': 'off',
    'unicorn/no-array-reduce': 'off',
  },
});

export default config;
