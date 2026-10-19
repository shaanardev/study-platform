import antiSlop from 'ultracite/oxlint/anti-slop';

import effectSchemaImport from './effect-schema-import.ts';
import functionalStyle from './functional-style.ts';

const projectPlugin = {
  meta: { name: 'project', version: '1.0.0' },
  rules: {
    ...functionalStyle.rules,
    'effect-schema-import': effectSchemaImport,
  },
};

export const projectJsPlugins = [
  ...antiSlop.jsPlugins,
  {
    name: 'project',
    specifier: new URL('index.ts', import.meta.url).pathname,
  },
];

export default projectPlugin;
