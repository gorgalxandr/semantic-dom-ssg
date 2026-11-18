import type { Rule } from 'eslint';
import { getAttributeValue, type JSXAttributeNode } from '../utils.js';

/** WAI-ARIA 1.2 concrete roles */
export const ARIA_ROLES: ReadonlySet<string> = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button',
  'caption', 'cell', 'checkbox', 'code', 'columnheader', 'combobox', 'complementary',
  'contentinfo', 'definition', 'deletion', 'dialog', 'directory', 'document', 'emphasis',
  'feed', 'figure', 'form', 'generic', 'grid', 'gridcell', 'group', 'heading', 'img',
  'insertion', 'link', 'list', 'listbox', 'listitem', 'log', 'main', 'marquee', 'math',
  'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'meter',
  'navigation', 'none', 'note', 'option', 'paragraph', 'presentation', 'progressbar',
  'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search',
  'searchbox', 'separator', 'slider', 'spinbutton', 'status', 'strong', 'subscript',
  'superscript', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox',
  'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
]);

/**
 * Rule: valid-role
 * Ensures ARIA roles are valid
 */
export const validRole: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure ARIA roles are valid',
      recommended: true,
    },
    schema: [],
    messages: {
      invalidRole: 'Invalid ARIA role "{{role}}". Use a valid WAI-ARIA role.',
      emptyRole: 'The role attribute is empty. Remove it or give it a valid WAI-ARIA role.',
    },
  },
  create(context) {
    return {
      JSXAttribute(node: Rule.Node) {
        const attr = node as unknown as JSXAttributeNode;
        if (attr.name?.name !== 'role') return;

        // Only roles on host elements are checked; a component may use `role` as its own prop.
        const owner = (node.parent as unknown as { name?: { type: string; name?: string } }).name;
        if (owner?.type !== 'JSXIdentifier' || !owner.name || !/^[a-z]/.test(owner.name)) return;

        const role = getAttributeValue([attr], 'role');
        if (role === undefined) return; // dynamic value

        const tokens = role.split(/\s+/).filter(Boolean);
        if (tokens.length === 0) {
          context.report({ node, messageId: 'emptyRole' });
          return;
        }
        for (const token of tokens) {
          if (!ARIA_ROLES.has(token.toLowerCase())) {
            context.report({ node, messageId: 'invalidRole', data: { role: token } });
          }
        }
      },
    };
  },
};
