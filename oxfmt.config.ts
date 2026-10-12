import { defineConfig } from 'oxfmt';
import ultracite from 'ultracite/oxfmt';

export default defineConfig({
  ...ultracite,
  arrowParens: 'always',
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    'apps/pack-cli/test/fixtures/**',
    '.local/**',
    '.ordewell/**',
    '.pnpm-store/**',
    '.worktrees/**',
    'packs/**',
    'plugins/**',
    '.codex/**',
    '.agents/**',
    'pnpm-lock.yaml',
  ],
  printWidth: 100,
  semi: true,
  singleQuote: true,
  sortImports: {
    ignoreCase: true,
    internalPattern: ['#lib/**'],
    newlinesBetween: true,
    order: 'asc',
  },
  sortTailwindcss: true,
  svelte: true,
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
});
