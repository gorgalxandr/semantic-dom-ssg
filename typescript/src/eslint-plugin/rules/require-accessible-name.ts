import type { Rule } from 'eslint';
import {
  asOpeningElement,
  getAttributeValue,
  hasAttribute,
  hasNonEmptyAttribute,
  hasRenderableChildren,
  hasSpread,
  hostTagName,
} from '../utils.js';

const INTERACTIVE_ELEMENTS = new Set(['button', 'a', 'input', 'select', 'textarea']);
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
  'menuitem', 'tab', 'switch', 'searchbox', 'slider', 'spinbutton',
]);
/** Elements that are named by a <label>, which may live anywhere in the tree */
const LABELABLE = new Set(['input', 'select', 'textarea']);
/** Input types that carry their own name or need none */
const SELF_NAMED_INPUTS = new Set(['hidden', 'submit', 'reset']);

/**
 * Rule: require-accessible-name
 * Ensures interactive elements have accessible names
 */
export const requireAccessibleName: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require interactive elements to have accessible names',
      recommended: true,
    },
    schema: [],
    messages: {
      missingAccessibleName:
        'Interactive element is missing an accessible name. Add aria-label, aria-labelledby, or visible text content.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node: Rule.Node) {
        const jsxNode = asOpeningElement(node);
        const tagName = hostTagName(jsxNode);
        if (!tagName) return;

        const { attributes } = jsxNode;
        const role = getAttributeValue(attributes, 'role');
        if (!INTERACTIVE_ELEMENTS.has(tagName) && !(role && INTERACTIVE_ROLES.has(role))) return;

        // Spread props may supply the name; do not guess.
        if (hasSpread(attributes)) return;
        if (tagName === 'a' && !hasAttribute(attributes, 'href') && !role) return;

        const named =
          hasNonEmptyAttribute(attributes, 'aria-label') ||
          hasNonEmptyAttribute(attributes, 'aria-labelledby') ||
          hasNonEmptyAttribute(attributes, 'title') ||
          hasAttribute(attributes, 'dangerouslySetInnerHTML') ||
          hasRenderableChildren(jsxNode);
        if (named) return;

        if (LABELABLE.has(tagName)) {
          const type = getAttributeValue(attributes, 'type') ?? 'text';
          if (tagName === 'input' && SELF_NAMED_INPUTS.has(type)) return;
          if (tagName === 'input' && type === 'image' && hasNonEmptyAttribute(attributes, 'alt')) return;
          if (tagName === 'input' && type === 'button' && hasNonEmptyAttribute(attributes, 'value')) return;
          // An id means a <label htmlFor> can name it; that cannot be checked per element.
          if (hasAttribute(attributes, 'id')) return;
        }

        context.report({ node, messageId: 'missingAccessibleName' });
      },
    };
  },
};
