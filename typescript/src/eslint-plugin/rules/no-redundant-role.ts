import type { Rule } from 'eslint';
import { asOpeningElement, findAttribute, getAttributeValue, hasAttribute, hostTagName } from '../utils.js';

const IMPLICIT_ROLES: Readonly<Record<string, string>> = {
  article: 'article',
  aside: 'complementary',
  button: 'button',
  dialog: 'dialog',
  form: 'form',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  hr: 'separator',
  img: 'img',
  li: 'listitem',
  main: 'main',
  nav: 'navigation',
  ol: 'list',
  option: 'option',
  progress: 'progressbar',
  table: 'table',
  textarea: 'textbox',
  ul: 'list',
};

/**
 * Rule: no-redundant-role
 * Warns about redundant ARIA roles
 */
export const noRedundantRole: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Warn about redundant ARIA roles that match implicit roles',
      recommended: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      redundantRole:
        'The role "{{role}}" is redundant on <{{element}}> element. The element already has this implicit role.',
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
        if (!role) return;

        // <a> is a link only with href; other context-dependent elements
        // (header, footer, section, select) are deliberately not listed.
        const implicit =
          tagName === 'a'
            ? hasAttribute(attributes, 'href') ? 'link' : undefined
            : Object.hasOwn(IMPLICIT_ROLES, tagName) ? IMPLICIT_ROLES[tagName] : undefined;
        if (!implicit || role.trim().toLowerCase() !== implicit) return;

        const roleAttr = findAttribute(attributes, 'role') as unknown as Rule.Node;
        context.report({
          node: roleAttr,
          messageId: 'redundantRole',
          data: { role: implicit, element: tagName },
          fix(fixer) {
            const [start, end] = roleAttr.range as [number, number];
            // Take the preceding whitespace with it so no double space is left.
            const before = context.sourceCode.text.slice(0, start);
            const padding = before.length - before.trimEnd().length;
            return fixer.removeRange([start - padding, end]);
          },
        });
      },
    };
  },
};
