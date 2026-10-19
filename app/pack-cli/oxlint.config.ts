import { recommended } from '@effect/tsgo/oxlint-presets';
import { defineConfig } from 'oxlint';
import type { OxlintConfig } from 'oxlint';
import vitest from 'ultracite/oxlint/vitest';

import rootConfig from '../../oxlint.config.ts';
import { projectJsPlugins } from '../../tooling/oxlint-plugin/index.ts';

const vitestForEffectTests = { ...vitest };

if (vitest.overrides !== undefined) {
  vitestForEffectTests.overrides = vitest.overrides.map((override) => ({
    ...override,
    rules: {
      ...override.rules,
      // Effect schema checks narrow Result values before asserting on the
      // payload. Vitest reports these branches as conditional expectations;
      // some checks also pass an assertion message.
      'vitest/expect-expect': 'off',
      'vitest/no-conditional-expect': 'off',
      'vitest/no-conditional-tests': 'error',
      'vitest/no-standalone-expect': 'off',
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
    } satisfies typeof override.rules,
  }));
}

const config: OxlintConfig = defineConfig({
  // Pack CLI-only additions: Effect rules and CLI-specific Vitest behavior.
  extends: [rootConfig, vitestForEffectTests, recommended],
  ignorePatterns: [
    '**/dist',
    '**/docs',
    '!.agents',
    '!.agents/**/*',
    '!.env',
    '!.gitignore',
    '!oxlint.config.ts',
    '!.vscode',
    '!.vscode/**/*',
    '!.codex/**/*',
  ],
  // Extending the root config alone does not activate its JS plugins in this nested config.
  jsPlugins: projectJsPlugins,
  overrides: [
    {
      files: ['**/*.{test,spec,test-d,spec-d}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}'],
      rules: { 'vitest/valid-expect': ['error', { maxArgs: 2 }] },
    },
  ],
  rules: {
    // hitl: turning off unstable api usage warnings to reduce noise in stdout from pnpm verify:all
    'effecttsgo/unstable-api-usage': 'off',
  },
});

export default config;
