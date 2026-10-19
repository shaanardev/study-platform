interface ForOfNode {
  type: 'ForOfStatement';
}

interface RuleContext {
  report: (diagnostic: { messageId: string; node: ForOfNode }) => void;
}

const noForOf = {
  create(context: RuleContext) {
    return {
      ForOfStatement(node: ForOfNode) {
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
};

export default {
  meta: { name: 'project', version: '1.0.0' },
  rules: { 'no-for-of': noForOf },
};
