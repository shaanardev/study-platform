import { loadConfig } from '@sveltejs/load-config';
import tsParser from '@typescript-eslint/parser';
import tailwindPlugin from 'eslint-plugin-better-tailwindcss';
import { getDefaultSelectors } from 'eslint-plugin-better-tailwindcss/defaults';
import { MatcherType, SelectorKind } from 'eslint-plugin-better-tailwindcss/types';
import sveltePlugin from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import vitest from 'ultracite/eslint/vitest';
import vitestTypeAware from 'ultracite/eslint/vitest/type-aware';

const webDirectory = import.meta.dirname;
const loadedSvelteConfig = await loadConfig(webDirectory, { traverse: false });
if (!loadedSvelteConfig || !('config' in loadedSvelteConfig)) {
  throw new Error(
    `Unable to load Svelte config from ${loadedSvelteConfig?.configFilePath ?? webDirectory}`,
    {
      cause:
        loadedSvelteConfig !== undefined && 'error' in loadedSvelteConfig
          ? loadedSvelteConfig.error
          : undefined,
    },
  );
}

const svelteFiles = ['src/**/*.svelte', 'src/**/*.svelte.js', 'src/**/*.svelte.ts'];
const vitestFiles = [
  '**/*.{test,spec,test-d,spec-d}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
  '**/__tests__/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
];
const tailwindPaletteClassPattern = String.raw`^(?:.*:)?!?(?:bg|text|decoration|placeholder|border(?:-(?:x|y|s|e|t|r|b|l))?|divide(?:-(?:x|y))?|outline|ring|ring-offset|inset-ring|(?:inset-)?shadow|accent|caret|fill|stroke|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)(?:/[^ ]+)?!?$`;

export default defineConfig([
  ...vitest,
  ...vitestTypeAware,
  {
    files: vitestFiles,
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      'vitest/no-conditional-in-test': 'error',
      // These layout rules overlap and add blank lines between each assertion group.
      'vitest/padding-around-all': 'off',
      'vitest/padding-around-expect-groups': 'off',
    },
  },
  {
    ignores: [
      '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
      '!**/*.svelte.{js,ts}',
      '!**/*.{test,spec,test-d,spec-d}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
      '!**/__tests__/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
      '.svelte-kit/**',
      'build/**',
      'dist/**',
      'coverage/**',
    ],
  },
  ...sveltePlugin.configs['flat/recommended'],
  {
    files: svelteFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        extraFileExtensions: ['.svelte'],
        parser: tsParser,
        svelteConfig: loadedSvelteConfig.config,
      },
    },
    rules: {
      'svelte/button-has-type': 'error',
      'svelte/no-at-const-tags': 'error',
      'svelte/no-at-html-tags': 'error',
      'svelte/no-navigation-without-base': 'error',
      'svelte/no-top-level-browser-globals': 'error',
      'svelte/prefer-const': 'error',
    },
  },
  {
    files: svelteFiles,
    plugins: { 'better-tailwindcss': tailwindPlugin },
    rules: {
      'better-tailwindcss/enforce-canonical-classes': 'error',
      'better-tailwindcss/enforce-shorthand-classes': 'error',
      'better-tailwindcss/no-concatenated-classes': 'error',
      'better-tailwindcss/no-conflicting-classes': 'error',
      'better-tailwindcss/no-deprecated-classes': 'error',
      'better-tailwindcss/no-duplicate-classes': 'error',
      'better-tailwindcss/no-restricted-classes': [
        'error',
        {
          restrict: [
            // Bracketed arbitrary values and properties are banned; arbitrary variants ending in `]:` remain allowed.
            String.raw`\[[^\[\]]*\](?!:)`,
            tailwindPaletteClassPattern,
          ],
        },
      ],
      'better-tailwindcss/no-unknown-classes': 'error',
      'better-tailwindcss/no-unnecessary-whitespace': 'error',
    },
    settings: {
      'better-tailwindcss': {
        cwd: webDirectory,
        detectComponentClasses: true,
        entryPoint: 'src/routes/layout.css',
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
  },
]);
