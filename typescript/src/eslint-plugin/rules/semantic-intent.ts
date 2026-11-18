import type { Rule } from 'eslint';
import {
  asOpeningElement,
  getAttributeValue,
  hasAttribute,
  hasSpread,
  hostTagName,
  type JSXAttributeNode,
} from '../utils.js';

const INTERACTIVE_ELEMENTS = new Set(['button', 'a', 'input', 'select']);

function inferIntent(tagName: string, attributes: JSXAttributeNode[]): string | undefined {
  const type = getAttributeValue(attributes, 'type');

  if (tagName === 'a') return 'navigate';
  if (tagName === 'select') return 'select';
  if (tagName === 'button') return type === 'submit' ? 'submit' : 'action';
  if (tagName === 'input') {
    if (type === 'submit') return 'submit';
    if (type === 'checkbox' || type === 'radio') return 'toggle';
    if (type === 'search') return 'search';
    if (type === 'file') return 'upload';
    return 'input';
  }
  return undefined;
}

/**
 * Rule: semantic-intent
 * Encourages use of data-semantic-intent attribute
 */
export const semanticIntent: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Encourage semantic intent annotation for agent readiness',
      recommended: false,
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      missingSemanticIntent:
        'Interactive element could benefit from data-semantic-intent attribute for better agent understanding.',
      suggestIntent: 'Add data-semantic-intent="{{intent}}"',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node: Rule.Node) {
        const jsxNode = asOpeningElement(node);
        const tagName = hostTagName(jsxNode);
        if (!tagName || !INTERACTIVE_ELEMENTS.has(tagName)) return;

        const { attributes } = jsxNode;
        if (hasAttribute(attributes, 'data-semantic-intent') || hasSpread(attributes)) return;
        if (tagName === 'input' && getAttributeValue(attributes, 'type') === 'hidden') return;

        const intent = inferIntent(tagName, attributes);
        context.report({
          node,
          messageId: 'missingSemanticIntent',
          suggest: intent
            ? [
                {
                  messageId: 'suggestIntent',
                  data: { intent },
                  // Insert after the tag name so this also works without attributes.
                  fix: (fixer) =>
                    fixer.insertTextAfter(
                      jsxNode.name, // JSX nodes are absent from ESTree types
                      ` data-semantic-intent="${intent}"`
                    ),
                },
              ]
            : [],
        });
      },
    };
  },
};
