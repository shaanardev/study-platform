import { recommended } from '@effect/tsgo/oxlint-presets';
import { defineConfig } from 'oxlint';
import type { OxlintConfig } from 'oxlint';
import vitest from 'ultracite/oxlint/vitest';

import rootConfig from '../../oxlint.config.ts';

const vitestForEffectTests = {
  ...vitest,
  ...(vitest.overrides === undefined
    ? {}
    : {
        overrides: vitest.overrides.map((override) => ({
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
        })),
      }),
};

const config: OxlintConfig = defineConfig({
  extends: [rootConfig, vitestForEffectTests, recommended],
  ignorePatterns: [
    '**/dist',
    '**/build',
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
  rules: {
    // hitl: turning off unstable api usage warnings to reduce noise in stdout from pnpm verify:all
    'effecttsgo/unstable-api-usage': 'off',
  },
});

export default config;
