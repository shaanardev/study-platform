import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import { loadConfig } from '@sveltejs/load-config';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import { getDefaultSelectors } from 'eslint-plugin-better-tailwindcss/defaults';
import { MatcherType, SelectorKind } from 'eslint-plugin-better-tailwindcss/types';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';
import ts from 'typescript-eslint';

const webDirectory = fileURLToPath(new URL('.', import.meta.url));
const loadedSvelteConfig = await loadConfig(webDirectory, { traverse: false });
if (!loadedSvelteConfig || !('config' in loadedSvelteConfig)) {
  throw new Error(
    `Unable to load Svelte config from ${loadedSvelteConfig?.configFilePath ?? webDirectory}`,
    {
      cause:
        loadedSvelteConfig && 'error' in loadedSvelteConfig ? loadedSvelteConfig.error : undefined,
    },
  );
}
const svelteConfig = loadedSvelteConfig.config;
const svelteFiles = ['src/**/*.svelte', 'src/**/*.svelte.js', 'src/**/*.svelte.ts'];
const frameworkFiles = ['src/**/*.{js,mjs,cjs,ts,mts,cts,tsx,svelte}'];
const tailwindPaletteClassPattern = String.raw`^(?:.*:)?!?(?:bg|text|decoration|placeholder|border(?:-(?:x|y|s|e|t|r|b|l))?|divide(?:-(?:x|y))?|outline|ring|ring-offset|inset-ring|(?:inset-)?shadow|accent|caret|fill|stroke|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)(?:/[^\s]+)?!?$`;

export default defineConfig([
  {
    ignores: ['.svelte-kit/**', 'build/**', 'dist/**', 'coverage/**'],
  },
  {
    files: ['src/**/*.svelte', 'src/**/*.svelte.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: svelteFiles,
    extends: [...svelte.configs.recommended, ...svelte.configs.prettier],
  },
  {
    files: frameworkFiles,
    plugins: { svelte },
    rules: {
      'svelte/no-navigation-without-base': 'error',
    },
  },
  {
    files: frameworkFiles,
    plugins: { 'better-tailwindcss': betterTailwindcss },
    settings: {
      'better-tailwindcss': {
        cwd: webDirectory,
        entryPoint: 'src/routes/layout.css',
        detectComponentClasses: true,
        selectors: [
          ...getDefaultSelectors(),
          {
            kind: SelectorKind.Attribute,
            match: [{ type: MatcherType.ObjectKey }],
            name: '^class$',
          },
        ],
      },
    },
    rules: {
      'better-tailwindcss/enforce-canonical-classes': 'error',
      'better-tailwindcss/enforce-shorthand-classes': 'error',
      'better-tailwindcss/no-concatenated-classes': 'error',
      'better-tailwindcss/no-conflicting-classes': 'error',
      'better-tailwindcss/no-deprecated-classes': 'error',
      'better-tailwindcss/no-duplicate-classes': 'error',
      'better-tailwindcss/no-unknown-classes': 'error',
      'better-tailwindcss/no-restricted-classes': [
        'error',
        {
          restrict: [
            // Bracketed arbitrary values and properties are banned, but an arbitrary variant ends in `]:` and is allowed.
            String.raw`\[[^\[\]]*\](?!:)`,
            tailwindPaletteClassPattern,
          ],
        },
      ],
      'better-tailwindcss/no-unnecessary-whitespace': 'error',
    },
  },
  {
    files: ['src/**/*.svelte'],
    extends: [...ts.configs.recommended],
    languageOptions: {
      parser: svelteParser,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        svelteConfig,
        parser: ts.parser,
        projectService: true,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'prefer-const': 'off',
      'svelte/prefer-const': 'error',
      'svelte/button-has-type': 'error',
      'svelte/no-at-const-tags': 'error',
      'svelte/no-at-html-tags': 'error',
      'svelte/no-top-level-browser-globals': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx,mts,cts}'],
    extends: [ts.configs.base],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
]);
