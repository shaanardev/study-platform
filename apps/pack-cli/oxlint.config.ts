import { recommended } from '@effect/tsgo/oxlint-presets';
import { defineConfig } from 'oxlint';
import type { OxlintConfig } from 'oxlint';

import rootConfig from '../../oxlint.config.ts';

const config: OxlintConfig = defineConfig({
  extends: [rootConfig, recommended],
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
  overrides: [
    {
      files: ['**/*.{test,spec,test-d,spec-d}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}'],
      rules: {
        'vitest/valid-expect': ['error', { maxArgs: 2 }],
      },
    },
  ],
  rules: {
    // hitl: turning off unstable api usage warnings to reduce noise in stdout from pnpm verify
    'effecttsgo/unstable-api-usage': 'off',
  },
});

export default config;
