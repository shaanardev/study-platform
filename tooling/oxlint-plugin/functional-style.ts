import type { Plugin } from '@oxlint/plugins';

export default {
  meta: { name: 'project' },
  rules: {
    'no-for-of': {
      create(context) {
        return {
          ForOfStatement(node) {
            context.report({ messageId: 'useFunctionalIteration', node });
          },
        };
      },
      meta: {
        docs: {
          description:
            'Disallow for...of statements in favor of functional array and iterator methods.',
        },
        messages: {
          useFunctionalIteration: 'Replace for...of with an array or iterator transformation.',
        },
        schema: [],
        type: 'problem',
      },
    },
  },
} satisfies Plugin;
