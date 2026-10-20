import type { Plugin } from '@oxlint/plugins';
import antiSlop from 'ultracite/oxlint/anti-slop';

import effectSchemaImport from './effect-schema-import.ts';
import functionalStyle from './functional-style.ts';
import noArrayMethodThisArgument from './no-array-method-this-argument.ts';

export default {
  meta: { name: 'project' },
  rules: {
    ...functionalStyle.rules,
    'effect-schema-import': effectSchemaImport,
    'no-array-method-this-argument': noArrayMethodThisArgument,
  },
} satisfies Plugin;

export const projectJsPlugins = [
  ...antiSlop.jsPlugins,
  {
    name: 'project',
    specifier: new URL('index.ts', import.meta.url).pathname,
  },
];
