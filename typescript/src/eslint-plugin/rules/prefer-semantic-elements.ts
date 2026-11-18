import type { Rule } from 'eslint';
import { asOpeningElement, getAttributeValue, hostTagName } from '../utils.js';

const ROLE_TO_ELEMENT: Readonly<Record<string, string>> = {
  article: 'article',
  banner: 'header',
  button: 'button',
  complementary: 'aside',
  contentinfo: 'footer',
  form: 'form',
  heading: 'h1-h6',
  link: 'a',
  list: 'ul/ol',
  listitem: 'li',
  main: 'main',
  navigation: 'nav',
  region: 'section',
};

/**
 * Rule: prefer-semantic-elements
 * Encourages semantic HTML over div/span with roles
 */
export const preferSemanticElements: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer semantic HTML elements over div/span with roles',
      recommended: true,
    },
    schema: [],
    messages: {
      preferSemantic: 'Prefer using <{{element}}> instead of <{{actual}}> with role="{{role}}".',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node: Rule.Node) {
        const jsxNode = asOpeningElement(node);
        const tagName = hostTagName(jsxNode);
        if (tagName !== 'div' && tagName !== 'span') return;

        const role = getAttributeValue(jsxNode.attributes, 'role')?.trim().toLowerCase();
        if (!role || !Object.hasOwn(ROLE_TO_ELEMENT, role)) return;

        context.report({
          node,
          messageId: 'preferSemantic',
          data: { element: ROLE_TO_ELEMENT[role], actual: tagName, role },
        });
      },
    };
  },
};
