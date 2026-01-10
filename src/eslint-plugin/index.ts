/**
 * ESLint Plugin for SemanticDOM
 * Provides linting rules for semantic accessibility and agent-readiness
 *
 * @packageDocumentation
 */

import type { Rule } from 'eslint';

/**
 * Rule: require-accessible-name
 * Ensures interactive elements have accessible names
 */
const requireAccessibleName: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require interactive elements to have accessible names',
      category: 'Accessibility',
      recommended: true,
    },
    fixable: undefined,
    schema: [],
    messages: {
      missingAccessibleName:
        'Interactive element is missing an accessible name. Add aria-label, aria-labelledby, or visible text content.',
    },
  },
  create(context) {
    const interactiveElements = ['button', 'a', 'input', 'select', 'textarea'];
    const interactiveRoles = [
      'button',
      'link',
      'textbox',
      'checkbox',
      'radio',
      'combobox',
      'listbox',
      'menuitem',
      'tab',
    ];

    return {
      JSXOpeningElement(node: Rule.Node) {
        const jsxNode = node as unknown as {
          name: { type: string; name?: string };
          attributes: Array<{
            type: string;
            name?: { type: string; name: string };
            value?: { type: string; value?: string };
          }>;
        };

        if (jsxNode.name.type !== 'JSXIdentifier') return;

        const tagName = jsxNode.name.name?.toLowerCase();
        if (!tagName) return;

        const role = getAttributeValue(jsxNode.attributes, 'role');
        const isInteractive =
          interactiveElements.includes(tagName) ||
          (role && interactiveRoles.includes(role));

        if (!isInteractive) return;

        const hasAriaLabel = hasAttribute(jsxNode.attributes, 'aria-label');
        const hasAriaLabelledBy = hasAttribute(jsxNode.attributes, 'aria-labelledby');
        const hasTitle = hasAttribute(jsxNode.attributes, 'title');

        // Check for text content (simplified - would need JSXText check)
        if (!hasAriaLabel && !hasAriaLabelledBy && !hasTitle) {
          context.report({
            node,
            messageId: 'missingAccessibleName',
          });
        }
      },
    };
  },
};

/**
 * Rule: valid-role
 * Ensures ARIA roles are valid
 */
const validRole: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure ARIA roles are valid',
      category: 'Accessibility',
      recommended: true,
    },
    fixable: undefined,
    schema: [],
    messages: {
      invalidRole: 'Invalid ARIA role "{{role}}". Use a valid WAI-ARIA role.',
    },
  },
  create(context) {
    const validRoles = [
      'alert',
      'alertdialog',
      'application',
      'article',
      'banner',
      'button',
      'cell',
      'checkbox',
      'columnheader',
      'combobox',
      'complementary',
      'contentinfo',
      'definition',
      'dialog',
      'directory',
      'document',
      'feed',
      'figure',
      'form',
      'grid',
      'gridcell',
      'group',
      'heading',
      'img',
      'link',
      'list',
      'listbox',
      'listitem',
      'log',
      'main',
      'marquee',
      'math',
      'menu',
      'menubar',
      'menuitem',
      'menuitemcheckbox',
      'menuitemradio',
      'navigation',
      'none',
      'note',
      'option',
      'presentation',
      'progressbar',
      'radio',
      'radiogroup',
      'region',
      'row',
      'rowgroup',
      'rowheader',
      'scrollbar',
      'search',
      'searchbox',
      'separator',
      'slider',
      'spinbutton',
      'status',
      'switch',
      'tab',
      'table',
      'tablist',
      'tabpanel',
      'term',
      'textbox',
      'timer',
      'toolbar',
      'tooltip',
      'tree',
      'treegrid',
      'treeitem',
    ];

    return {
      JSXAttribute(node: Rule.Node) {
        const attrNode = node as unknown as {
          name: { type: string; name: string };
          value: { type: string; value?: string };
        };

        if (attrNode.name.name !== 'role') return;
        if (!attrNode.value || attrNode.value.type !== 'Literal') return;

        const role = attrNode.value.value;
        if (typeof role !== 'string') return;

        // Handle multiple roles
        const roles = role.split(/\s+/);
        for (const r of roles) {
          if (!validRoles.includes(r.toLowerCase())) {
            context.report({
              node,
              messageId: 'invalidRole',
              data: { role: r },
            });
          }
        }
      },
    };
  },
};

/**
 * Rule: semantic-intent
 * Encourages use of data-semantic-intent attribute
 */
const semanticIntent: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Encourage semantic intent annotation for agent readiness',
      category: 'Best Practices',
      recommended: false,
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingSemnaticIntent:
        'Interactive element could benefit from data-semantic-intent attribute for better agent understanding.',
      suggestIntent: 'Add data-semantic-intent="{{intent}}"',
    },
  },
  create(context) {
    const interactiveElements = ['button', 'a', 'input', 'select'];

    return {
      JSXOpeningElement(node: Rule.Node) {
        const jsxNode = node as unknown as {
          name: { type: string; name?: string };
          attributes: Array<{
            type: string;
            name?: { type: string; name: string };
            value?: { type: string; value?: string };
          }>;
        };

        if (jsxNode.name.type !== 'JSXIdentifier') return;

        const tagName = jsxNode.name.name?.toLowerCase();
        if (!tagName || !interactiveElements.includes(tagName)) return;

        const hasIntent = hasAttribute(jsxNode.attributes, 'data-semantic-intent');
        if (hasIntent) return;

        // Suggest based on element type and attributes
        const suggestedIntent = inferIntent(tagName, jsxNode.attributes);

        context.report({
          node,
          messageId: 'missingSemnaticIntent',
          suggest: suggestedIntent
            ? [
                {
                  messageId: 'suggestIntent',
                  data: { intent: suggestedIntent },
                  fix(fixer) {
                    const lastAttr = jsxNode.attributes[jsxNode.attributes.length - 1];
                    if (lastAttr) {
                      return fixer.insertTextAfter(
                        lastAttr as unknown as Rule.Node,
                        ` data-semantic-intent="${suggestedIntent}"`
                      );
                    }
                    return null;
                  },
                },
              ]
            : [],
        });
      },
    };
  },
};

/**
 * Rule: no-redundant-role
 * Warns about redundant ARIA roles
 */
const noRedundantRole: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Warn about redundant ARIA roles that match implicit roles',
      category: 'Best Practices',
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
    const implicitRoles: Record<string, string> = {
      a: 'link',
      article: 'article',
      aside: 'complementary',
      button: 'button',
      dialog: 'dialog',
      footer: 'contentinfo',
      form: 'form',
      h1: 'heading',
      h2: 'heading',
      h3: 'heading',
      h4: 'heading',
      h5: 'heading',
      h6: 'heading',
      header: 'banner',
      img: 'img',
      li: 'listitem',
      main: 'main',
      nav: 'navigation',
      ol: 'list',
      option: 'option',
      progress: 'progressbar',
      section: 'region',
      select: 'listbox',
      table: 'table',
      textarea: 'textbox',
      ul: 'list',
    };

    return {
      JSXOpeningElement(node: Rule.Node) {
        const jsxNode = node as unknown as {
          name: { type: string; name?: string };
          attributes: Array<{
            type: string;
            name?: { type: string; name: string };
            value?: { type: string; value?: string };
          }>;
        };

        if (jsxNode.name.type !== 'JSXIdentifier') return;

        const tagName = jsxNode.name.name?.toLowerCase();
        if (!tagName) return;

        const implicitRole = implicitRoles[tagName];
        if (!implicitRole) return;

        const roleAttr = jsxNode.attributes.find(
          (attr) =>
            attr.type === 'JSXAttribute' &&
            attr.name?.name === 'role' &&
            attr.value?.type === 'Literal' &&
            attr.value.value === implicitRole
        );

        if (roleAttr) {
          context.report({
            node: roleAttr as unknown as Rule.Node,
            messageId: 'redundantRole',
            data: { role: implicitRole, element: tagName },
            fix(fixer) {
              return fixer.remove(roleAttr as unknown as Rule.Node);
            },
          });
        }
      },
    };
  },
};

/**
 * Rule: require-heading-hierarchy
 * Ensures heading levels follow proper hierarchy
 */
const requireHeadingHierarchy: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure heading levels follow proper hierarchy',
      category: 'Accessibility',
      recommended: true,
    },
    fixable: undefined,
    schema: [],
    messages: {
      skippedLevel:
        'Heading level skipped. Expected h{{expected}} but found h{{actual}}. Heading levels should not skip.',
    },
  },
  create(context) {
    let lastHeadingLevel = 0;

    return {
      'Program:exit'() {
        lastHeadingLevel = 0;
      },
      JSXOpeningElement(node: Rule.Node) {
        const jsxNode = node as unknown as {
          name: { type: string; name?: string };
        };

        if (jsxNode.name.type !== 'JSXIdentifier') return;

        const tagName = jsxNode.name.name?.toLowerCase();
        if (!tagName) return;

        const match = tagName.match(/^h([1-6])$/);
        if (!match) return;

        const level = parseInt(match[1], 10);

        if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
          context.report({
            node,
            messageId: 'skippedLevel',
            data: {
              expected: (lastHeadingLevel + 1).toString(),
              actual: level.toString(),
            },
          });
        }

        lastHeadingLevel = level;
      },
    };
  },
};

/**
 * Rule: prefer-semantic-elements
 * Encourages semantic HTML over div/span with roles
 */
const preferSemanticElements: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer semantic HTML elements over div/span with roles',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: undefined,
    schema: [],
    messages: {
      preferSemantic:
        'Prefer using <{{element}}> instead of <{{actual}}> with role="{{role}}".',
    },
  },
  create(context) {
    const roleToElement: Record<string, string> = {
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

    return {
      JSXOpeningElement(node: Rule.Node) {
        const jsxNode = node as unknown as {
          name: { type: string; name?: string };
          attributes: Array<{
            type: string;
            name?: { type: string; name: string };
            value?: { type: string; value?: string };
          }>;
        };

        if (jsxNode.name.type !== 'JSXIdentifier') return;

        const tagName = jsxNode.name.name?.toLowerCase();
        if (tagName !== 'div' && tagName !== 'span') return;

        const role = getAttributeValue(jsxNode.attributes, 'role');
        if (!role) return;

        const semanticElement = roleToElement[role];
        if (semanticElement) {
          context.report({
            node,
            messageId: 'preferSemantic',
            data: {
              element: semanticElement,
              actual: tagName,
              role,
            },
          });
        }
      },
    };
  },
};

// Helper functions

function hasAttribute(
  attributes: Array<{
    type: string;
    name?: { type: string; name: string };
  }>,
  name: string
): boolean {
  return attributes.some(
    (attr) => attr.type === 'JSXAttribute' && attr.name?.name === name
  );
}

function getAttributeValue(
  attributes: Array<{
    type: string;
    name?: { type: string; name: string };
    value?: { type: string; value?: string };
  }>,
  name: string
): string | undefined {
  const attr = attributes.find(
    (a) => a.type === 'JSXAttribute' && a.name?.name === name
  );
  if (!attr || !attr.value) return undefined;
  if (attr.value.type === 'Literal') return attr.value.value;
  return undefined;
}

function inferIntent(
  tagName: string,
  attributes: Array<{
    type: string;
    name?: { type: string; name: string };
    value?: { type: string; value?: string };
  }>
): string | undefined {
  const type = getAttributeValue(attributes, 'type');

  if (tagName === 'a') return 'navigate';
  if (tagName === 'button') {
    if (type === 'submit') return 'submit';
    return 'toggle';
  }
  if (tagName === 'input') {
    if (type === 'submit') return 'submit';
    if (type === 'checkbox' || type === 'radio') return 'toggle';
    if (type === 'search') return 'search';
    return 'input';
  }
  if (tagName === 'select') return 'select';

  return undefined;
}

/**
 * All rules
 */
export const rules: Record<string, Rule.RuleModule> = {
  'require-accessible-name': requireAccessibleName,
  'valid-role': validRole,
  'semantic-intent': semanticIntent,
  'no-redundant-role': noRedundantRole,
  'require-heading-hierarchy': requireHeadingHierarchy,
  'prefer-semantic-elements': preferSemanticElements,
};

/**
 * Recommended configuration
 * Note: For ESLint flat config, use the plugin directly
 */
export const configs = {
  recommended: {
    rules: {
      'semantic-dom/require-accessible-name': 'error',
      'semantic-dom/valid-role': 'error',
      'semantic-dom/no-redundant-role': 'warn',
      'semantic-dom/require-heading-hierarchy': 'warn',
      'semantic-dom/prefer-semantic-elements': 'warn',
    },
  },
  strict: {
    rules: {
      'semantic-dom/require-accessible-name': 'error',
      'semantic-dom/valid-role': 'error',
      'semantic-dom/semantic-intent': 'error',
      'semantic-dom/no-redundant-role': 'error',
      'semantic-dom/require-heading-hierarchy': 'error',
      'semantic-dom/prefer-semantic-elements': 'error',
    },
  },
  'agent-ready': {
    rules: {
      'semantic-dom/require-accessible-name': 'error',
      'semantic-dom/valid-role': 'error',
      'semantic-dom/semantic-intent': 'warn',
      'semantic-dom/no-redundant-role': 'warn',
      'semantic-dom/require-heading-hierarchy': 'error',
      'semantic-dom/prefer-semantic-elements': 'warn',
    },
  },
};

/**
 * Plugin export
 */
export default {
  rules,
  configs,
};
