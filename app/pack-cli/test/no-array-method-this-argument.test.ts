import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import arrayMethodThisArgument from '../../../tooling/oxlint-plugin/no-array-method-this-argument.js';

const lint = (source: string) =>
  new Linter().verify(source, {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    plugins: {
      project: {
        meta: { name: 'project', version: '1.0.0' },
        rules: { 'no-array-method-this-argument': arrayMethodThisArgument },
      },
    },
    rules: { 'project/no-array-method-this-argument': 'error' },
  });

describe('project/no-array-method-this-argument', () => {
  it('ignores Effect.forEach calls imported from the Effect package', () => {
    const messages = lint(`
      import { Effect as Fx } from 'effect';
      Fx.forEach(items, (item) => item);
    `);

    expect(messages).toStrictEqual([]);
  });

  it('reports a real array method this argument', () => {
    const messages = lint('questions.forEach((question) => question, context);');

    expect(messages.map(({ messageId }) => messageId)).toStrictEqual(['arrayMethod']);
  });

  it('ignores methods on constructed non-array values', () => {
    const messages = lint('new CustomCollection().forEach((item) => item, context);');

    expect(messages).toStrictEqual([]);
  });

  it('reports the this argument to Array.from', () => {
    const messages = lint('Array.from(items, (item) => item, context);');

    expect(messages.map(({ messageId }) => messageId)).toStrictEqual(['arrayStaticMethod']);
  });
});
