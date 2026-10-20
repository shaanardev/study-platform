import type { Rule } from 'eslint';
import type * as ESTree from 'estree';

const arrayMethodArgumentCount = 2;
const arrayStaticMethodArgumentCount = 3;
const arrayStaticThisArgumentIndex = arrayMethodArgumentCount;

const arrayMethodsWithThisArgument = new Set([
  'every',
  'filter',
  'find',
  'findLast',
  'findIndex',
  'findLastIndex',
  'flatMap',
  'forEach',
  'map',
  'some',
]);

const typedArrayConstructors = new Set([
  'BigInt64Array',
  'BigUint64Array',
  'Float16Array',
  'Float32Array',
  'Float64Array',
  'Int16Array',
  'Int32Array',
  'Int8Array',
  'Uint16Array',
  'Uint32Array',
  'Uint8Array',
  'Uint8ClampedArray',
]);

const ignoredMethodCalls = new Set([
  'lodash.every',
  '_.every',
  'underscore.every',
  'lodash.filter',
  '_.filter',
  'underscore.filter',
  'Vue.filter',
  'R.filter',
  'lodash.find',
  '_.find',
  'underscore.find',
  'R.find',
  'lodash.findLast',
  '_.findLast',
  'underscore.findLast',
  'R.findLast',
  'lodash.findIndex',
  '_.findIndex',
  'underscore.findIndex',
  'R.findIndex',
  'lodash.findLastIndex',
  '_.findLastIndex',
  'underscore.findLastIndex',
  'R.findLastIndex',
  'lodash.flatMap',
  '_.flatMap',
  'lodash.forEach',
  '_.forEach',
  'React.Children.forEach',
  'Children.forEach',
  'R.forEach',
  'lodash.map',
  '_.map',
  'underscore.map',
  'React.Children.map',
  'Children.map',
  'jQuery.map',
  '$.map',
  'R.map',
  'lodash.some',
  '_.some',
  'underscore.some',
]);

const effectModuleNames = new Set(['effect', 'effect/Effect']);

const definitelyNonFunctionNodeTypes = new Set([
  'ArrayExpression',
  'BinaryExpression',
  'ClassExpression',
  'Literal',
  'ObjectExpression',
  'TemplateLiteral',
  'UnaryExpression',
  'UpdateExpression',
]);

const likelyNonFunctionNodeTypes = new Set([
  'AssignmentExpression',
  'AwaitExpression',
  'NewExpression',
  'TaggedTemplateExpression',
  'ThisExpression',
]);

const isIdentifier = (node: ESTree.Node | undefined): node is ESTree.Identifier =>
  node?.type === 'Identifier';

const isMemberExpression = (node: ESTree.Node | undefined): node is ESTree.MemberExpression =>
  node?.type === 'MemberExpression';

const isNewExpression = (node: ESTree.Node | undefined): node is ESTree.NewExpression =>
  node?.type === 'NewExpression';

const getMemberPropertyName = (node: ESTree.MemberExpression): string | undefined => {
  if (!node.computed && isIdentifier(node.property)) {
    return node.property.name;
  }

  if (node.computed && node.property.type === 'Literal') {
    return String(node.property.value);
  }

  return undefined;
};

const getStaticMemberPath = (node: ESTree.Node): string | undefined => {
  if (isIdentifier(node)) {
    return node.name;
  }

  if (!isMemberExpression(node)) {
    return undefined;
  }

  const parentPath = getStaticMemberPath(node.object);
  const propertyName = getMemberPropertyName(node);

  return parentPath === undefined || propertyName === undefined
    ? undefined
    : `${parentPath}.${propertyName}`;
};

const getEffectNamespaceNames = (program: Rule.RuleContext['sourceCode']['ast']): Set<string> =>
  new Set(
    program.body.flatMap((statement) => {
      if (
        statement.type !== 'ImportDeclaration' ||
        !effectModuleNames.has(String(statement.source.value))
      ) {
        return [];
      }

      return statement.specifiers.flatMap((specifier) => {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          return [specifier.local.name];
        }

        if (
          specifier.type === 'ImportSpecifier' &&
          isIdentifier(specifier.imported) &&
          specifier.imported.name === 'Effect'
        ) {
          return [specifier.local.name];
        }

        return [];
      });
    }),
  );

const isEffectForEachCall = (
  call: ESTree.CallExpression,
  effectNamespaceNames: Set<string>,
): boolean => {
  if (call.arguments.length !== arrayMethodArgumentCount || !isMemberExpression(call.callee)) {
    return false;
  }

  const propertyName = getMemberPropertyName(call.callee);

  return (
    propertyName === 'forEach' &&
    isIdentifier(call.callee.object) &&
    effectNamespaceNames.has(call.callee.object.name)
  );
};

const hasKnownNonArrayReceiver = (node: ESTree.MemberExpression): boolean => {
  if (!isNewExpression(node.object)) {
    return false;
  }

  return (
    !isIdentifier(node.object.callee) ||
    (node.object.callee.name !== 'Array' && !typedArrayConstructors.has(node.object.callee.name))
  );
};

const isBoundMethodCall = (node: ESTree.Node): boolean =>
  node.type === 'CallExpression' &&
  !node.optional &&
  isMemberExpression(node.callee) &&
  !node.callee.optional &&
  getMemberPropertyName(node.callee) === 'bind';

const isDefinitelyNotFunction = (node: ESTree.Node): boolean =>
  definitelyNonFunctionNodeTypes.has(node.type) ||
  likelyNonFunctionNodeTypes.has(node.type) ||
  (node.type === 'Identifier' && node.name === 'undefined') ||
  (node.type === 'CallExpression' && !isBoundMethodCall(node));

const reportArrayMethodThisArgument = (
  context: Rule.RuleContext,
  call: ESTree.CallExpression,
  member: ESTree.MemberExpression,
  method: string,
): void => {
  if (call.arguments.length !== arrayMethodArgumentCount) {
    return;
  }

  const callback = call.arguments.at(0);
  const thisArgument = call.arguments.at(1);

  if (
    callback === undefined ||
    thisArgument === undefined ||
    !arrayMethodsWithThisArgument.has(method) ||
    hasKnownNonArrayReceiver(member) ||
    isDefinitelyNotFunction(callback) ||
    ignoredMethodCalls.has(getStaticMemberPath(call.callee) ?? '')
  ) {
    return;
  }

  context.report({ data: { method }, messageId: 'arrayMethod', node: thisArgument });
};

const reportArrayStaticMethodThisArgument = (
  context: Rule.RuleContext,
  call: ESTree.CallExpression,
  member: ESTree.MemberExpression,
  method: string,
): void => {
  if (
    !isIdentifier(member.object) ||
    member.object.name !== 'Array' ||
    (method !== 'from' && method !== 'fromAsync') ||
    call.arguments.length !== arrayStaticMethodArgumentCount
  ) {
    return;
  }

  const callback = call.arguments.at(1);
  const thisArgument = call.arguments.at(arrayStaticThisArgumentIndex);

  if (callback !== undefined && thisArgument !== undefined && !isDefinitelyNotFunction(callback)) {
    context.report({ data: { method }, messageId: 'arrayStaticMethod', node: thisArgument });
  }
};

const arrayMethodThisArgument: Rule.RuleModule = {
  create(context) {
    const effectNamespaceNames = getEffectNamespaceNames(context.sourceCode.ast);

    return {
      CallExpression(node) {
        if (node.optional) {
          return;
        }

        if (!isMemberExpression(node.callee) || node.callee.optional) {
          return;
        }

        const member = node.callee;
        const method = getMemberPropertyName(member);

        if (method === undefined || isEffectForEachCall(node, effectNamespaceNames)) {
          return;
        }

        reportArrayMethodThisArgument(context, node, member, method);
        reportArrayStaticMethodThisArgument(context, node, member, method);
      },
    };
  },
  meta: {
    docs: {
      description:
        'Disallow using the this argument in array methods while ignoring Effect.forEach iterables.',
    },
    messages: {
      arrayMethod: 'Do not use the `this` argument in `Array#{{method}}()`.',
      arrayStaticMethod: 'Do not use the `this` argument in `Array.{{method}}()`.',
    },
    schema: [],
    type: 'suggestion',
  },
};

export default arrayMethodThisArgument;
