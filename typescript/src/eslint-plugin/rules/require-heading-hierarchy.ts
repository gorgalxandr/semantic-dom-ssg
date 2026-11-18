import type { Rule } from 'eslint';
import { asOpeningElement, hostTagName } from '../utils.js';

/**
 * Rule: require-heading-hierarchy
 * Ensures heading levels follow proper hierarchy
 *
 * Levels are tracked per component (function or class), since each one renders
 * independently and a file often holds several.
 */
export const requireHeadingHierarchy: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure heading levels follow proper hierarchy',
      recommended: true,
    },
    schema: [],
    messages: {
      skippedLevel:
        'Heading level skipped. Expected h{{expected}} but found h{{actual}}. Heading levels should not skip.',
    },
  },
  create(context) {
    const scopes: number[] = [0];
    const enter = (): void => void scopes.push(0);
    const exit = (): void => void scopes.pop();

    return {
      FunctionDeclaration: enter,
      FunctionExpression: enter,
      ArrowFunctionExpression: enter,
      ClassDeclaration: enter,
      ClassExpression: enter,
      'FunctionDeclaration:exit': exit,
      'FunctionExpression:exit': exit,
      'ArrowFunctionExpression:exit': exit,
      'ClassDeclaration:exit': exit,
      'ClassExpression:exit': exit,

      JSXOpeningElement(node: Rule.Node) {
        const tagName = hostTagName(asOpeningElement(node));
        const match = tagName ? /^h([1-6])$/.exec(tagName) : null;
        if (!match) return;

        const level = Number.parseInt(match[1], 10);
        const last = scopes[scopes.length - 1];

        if (last > 0 && level > last + 1) {
          context.report({
            node,
            messageId: 'skippedLevel',
            data: { expected: String(last + 1), actual: String(level) },
          });
        }
        scopes[scopes.length - 1] = level;
      },
    };
  },
};
