import js from '@eslint/js';
import { loadConfig } from '@sveltejs/load-config';
import config from 'eslint-plugin-better-tailwindcss';
import { getDefaultSelectors } from 'eslint-plugin-better-tailwindcss/defaults';
import { MatcherType, SelectorKind } from 'eslint-plugin-better-tailwindcss/types';
import plugin from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';
import { parser } from 'typescript-eslint';
import svelte from 'ultracite/eslint/svelte';

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
const svelteConfig = loadedSvelteConfig.config;
const svelteFiles = ['src/**/*.svelte', 'src/**/*.svelte.js', 'src/**/*.svelte.ts'];
const frameworkFiles = svelteFiles;
const tailwindPaletteClassPattern = String.raw`^(?:.*:)?!?(?:bg|text|decoration|placeholder|border(?:-(?:x|y|s|e|t|r|b|l))?|divide(?:-(?:x|y))?|outline|ring|ring-offset|inset-ring|(?:inset-)?shadow|accent|caret|fill|stroke|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)(?:/[^\s]+)?!?$`;

const rulesOff = (
  pluginName: string | undefined,
  pluginRules: Record<string, unknown> | undefined,
): Record<string, 'off'> =>
  Object.fromEntries(
    Object.keys(pluginRules ?? {}).map((rule) => [
      pluginName === undefined ? rule : `${pluginName}/${rule}`,
      'off',
    ]),
  );

const sharedPluginRulesOff: Record<string, 'off'> = {};
for (const svelteConfigEntry of svelte) {
  for (const [pluginName, sharedPlugin] of Object.entries(svelteConfigEntry.plugins ?? {})) {
    if (pluginName !== 'svelte') {
      Object.assign(sharedPluginRulesOff, rulesOff(pluginName, sharedPlugin.rules));
    }
  }
}
const coreRulesOff = rulesOff(undefined, js.configs.all.rules);

export default defineConfig([
  ...svelte,
  {
    ignores: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}', '!**/*.svelte.{js,ts}'],
  },
  {
    ignores: ['.svelte-kit/**', 'build/**', 'dist/**', 'coverage/**'],
  },
  {
    files: frameworkFiles,
    plugins: { svelte: plugin },
    rules: {
      'svelte/no-navigation-without-base': 'error',
      // Tailwind generates utility classes outside component CSS, so this rule
      // treats valid Tailwind classes as unused.
      'svelte/no-unused-class-name': 'off',
    },
  },
  {
    files: frameworkFiles,
    plugins: { 'better-tailwindcss': config },
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
            // Bracketed arbitrary values and properties are banned, but an arbitrary variant ends in `]:` and is allowed.
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
  {
    files: ['src/**/*.svelte'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parser: svelteParser,
      parserOptions: {
        extraFileExtensions: ['.svelte'],
        parser,
        svelteConfig,
      },
    },
    rules: {
      'prefer-const': 'off',
      'svelte/button-has-type': 'error',
      'svelte/no-at-const-tags': 'error',
      'svelte/no-at-html-tags': 'error',
      'svelte/no-top-level-browser-globals': 'error',
      'svelte/prefer-const': 'error',
    },
  },
  {
    files: svelteFiles,
    rules: {
      ...coreRulesOff,
      ...sharedPluginRulesOff,
    },
  },
]);
