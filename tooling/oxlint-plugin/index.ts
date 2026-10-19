import antiSlop from 'ultracite/oxlint/anti-slop';

export const projectJsPlugins = [
  ...antiSlop.jsPlugins,
  {
    name: 'project',
    specifier: new URL('functional-style.ts', import.meta.url).pathname,
  },
];
