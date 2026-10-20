import type { Rule } from '@oxlint/plugins';

export default {
  create(context) {
    return {
      ImportDeclaration(node) {
        const importsSchemaFromBarrel =
          node.source.value === 'effect' &&
          node.specifiers.some(
            (specifier) =>
              specifier.local.name === 'Schema' ||
              (specifier.type === 'ImportSpecifier' &&
                specifier.imported.type === 'Identifier' &&
                specifier.imported.name === 'Schema'),
          );

        const usesCanonicalSchemaNamespace =
          node.source.value === 'effect/Schema' &&
          node.specifiers.length === 1 &&
          node.specifiers.every(
            (specifier) =>
              specifier.type === 'ImportNamespaceSpecifier' && specifier.local.name === 'Schema',
          );

        const hasInvalidSchemaModuleImport =
          node.source.value === 'effect/Schema' && !usesCanonicalSchemaNamespace;

        if (importsSchemaFromBarrel || hasInvalidSchemaModuleImport) {
          context.report({ messageId: 'useCanonicalSchemaNamespace', node });
        }
      },
    };
  },
  meta: {
    docs: {
      description: 'Require the canonical Effect Schema namespace import.',
    },
    messages: {
      useCanonicalSchemaNamespace:
        "Import Schema only as `import * as Schema from 'effect/Schema'`; remove named/default imports and use the `Schema` namespace alias.",
    },
    schema: [],
    type: 'problem',
  },
} satisfies Rule;
