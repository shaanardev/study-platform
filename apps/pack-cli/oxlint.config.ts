import { recommended } from '@effect/tsgo/oxlint-presets';
import { defineConfig, type OxlintConfig } from 'oxlint';

import rootConfig from '../../.oxlintrc.json' with { type: 'json' };

export default defineConfig({
  extends: [rootConfig as unknown as OxlintConfig, recommended],
  options: { typeAware: true },
  plugins: ['effecttsgo', 'import', 'vitest'],
  rules: {
    'array-callback-return': 'error',
    'import/no-cycle': 'error',
    'import/no-self-import': 'error',
    'typescript/no-non-null-assertion': 'error',
    'typescript/no-explicit-any': 'error',
    'typescript/no-unsafe-assignment': 'error',
    'typescript/no-unsafe-argument': 'error',
    'typescript/no-unsafe-call': 'error',
    'typescript/no-unsafe-member-access': 'error',
    'typescript/no-unsafe-return': 'error',
    'typescript/only-throw-error': 'error',
    'vitest/expect-expect': 'off',
    'vitest/no-conditional-expect': 'off',
    'vitest/no-conditional-tests': 'error',
    'vitest/no-standalone-expect': 'off',
    'vitest/valid-expect': ['error', { maxArgs: 2 }],
    'vitest/valid-title': 'off',
  },
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
});
