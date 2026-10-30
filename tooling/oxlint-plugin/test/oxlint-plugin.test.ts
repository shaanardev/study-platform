import { RuleTester } from 'oxlint/plugins-dev';
import { describe, expect, test } from 'vitest';

import effectSchemaImport from '../effect-schema-import.js';
import functionalStyle from '../functional-style.js';
import arrayMethodThisArgument from '../no-array-method-this-argument.js';

RuleTester.describe = (name, run) => {
  describe(name, () => {
    run();
  });
};

RuleTester.it = (name, run) => {
  test(name, () => {
    run();
    expect(true).toBeTruthy();
  });
};

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' }, sourceType: 'module' },
});

describe('project/no-array-method-this-argument', () => {
  ruleTester.run('no-array-method-this-argument', arrayMethodThisArgument, {
    invalid: [
      {
        code: 'questions.forEach((question) => question, context);',
        errors: [{ messageId: 'arrayMethod' }],
        name: 'reports a real array method this argument',
      },
      {
        code: 'Array.from(items, (item) => item, context);',
        errors: [{ messageId: 'arrayStaticMethod' }],
        name: 'reports the this argument to Array.from',
      },
    ],
    valid: [
      {
        code: `import { Effect as Fx } from 'effect'; Fx.forEach(items, (item) => item);`,
        name: 'ignores Effect.forEach calls imported from the Effect package',
      },
      {
        code: 'new CustomCollection().forEach((item) => item, context);',
        name: 'ignores methods on constructed non-array values',
      },
    ],
  });
});

describe('project/effect-schema-import', () => {
  ruleTester.run('effect-schema-import', effectSchemaImport, {
    invalid: [
      {
        code: "import { Schema } from 'effect';",
        errors: [{ messageId: 'useCanonicalSchemaNamespace' }],
      },
      {
        code: "import Schema from 'effect/Schema';",
        errors: [{ messageId: 'useCanonicalSchemaNamespace' }],
      },
    ],
    valid: ["import * as Schema from 'effect/Schema';"],
  });
});

describe('project/no-for-of', () => {
  ruleTester.run('no-for-of', functionalStyle.rules['no-for-of'], {
    invalid: [
      {
        code: 'for (const item of items) consume(item);',
        errors: [{ messageId: 'useFunctionalIteration' }],
      },
    ],
    valid: ['items.forEach((item) => consume(item));'],
  });
});
