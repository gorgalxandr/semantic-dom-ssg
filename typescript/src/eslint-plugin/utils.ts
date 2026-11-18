/**
 * JSX helpers shared by the SemanticDOM ESLint rules
 */

import type { Rule } from 'eslint';

export interface JSXAttributeNode {
  type: string;
  name?: { type: string; name: string };
  value?: {
    type: string;
    value?: unknown;
    expression?: { type: string; value?: unknown; quasis?: Array<{ value: { cooked?: string } }>; expressions?: unknown[] };
  } | null;
}

export interface JSXChildNode {
  type: string;
  value?: string;
  expression?: { type: string };
}

export interface JSXOpeningElementNode {
  type: string;
  name: { type: string; name?: string };
  attributes: JSXAttributeNode[];
  parent?: { type: string; children?: JSXChildNode[] };
}

export function asOpeningElement(node: Rule.Node): JSXOpeningElementNode {
  return node as unknown as JSXOpeningElementNode;
}

/**
 * Tag name of a host (DOM) element. Components (`<Button>`), member
 * expressions (`<UI.Button>`) and namespaced names return undefined: their
 * rendered output is unknown, so DOM rules must not guess.
 */
export function hostTagName(node: JSXOpeningElementNode): string | undefined {
  if (node.name.type !== 'JSXIdentifier') return undefined;
  const name = node.name.name;
  if (!name || name[0] !== name[0].toLowerCase() || name[0] === name[0].toUpperCase()) {
    return undefined;
  }
  return name;
}

export function findAttribute(
  attributes: JSXAttributeNode[],
  name: string
): JSXAttributeNode | undefined {
  return attributes.find((attr) => attr.type === 'JSXAttribute' && attr.name?.name === name);
}

export function hasAttribute(attributes: JSXAttributeNode[], name: string): boolean {
  return findAttribute(attributes, name) !== undefined;
}

/** True when the element spreads props, so any attribute might be present */
export function hasSpread(attributes: JSXAttributeNode[]): boolean {
  return attributes.some((attr) => attr.type === 'JSXSpreadAttribute');
}

/**
 * Static string value of an attribute: `a="x"`, `a={'x'}` or a template
 * literal without expressions. Undefined when absent or dynamic.
 */
export function getAttributeValue(
  attributes: JSXAttributeNode[],
  name: string
): string | undefined {
  const value = findAttribute(attributes, name)?.value;
  if (!value) return undefined;

  if (value.type === 'Literal') {
    return typeof value.value === 'string' ? value.value : undefined;
  }
  if (value.type !== 'JSXExpressionContainer' || !value.expression) return undefined;

  const { expression } = value;
  if (expression.type === 'Literal') {
    return typeof expression.value === 'string' ? expression.value : undefined;
  }
  if (expression.type === 'TemplateLiteral' && expression.expressions?.length === 0) {
    return expression.quasis?.[0]?.value.cooked;
  }
  return undefined;
}

/** True when the attribute is present with a value that is not a static empty string */
export function hasNonEmptyAttribute(attributes: JSXAttributeNode[], name: string): boolean {
  const attr = findAttribute(attributes, name);
  if (!attr) return false;
  const value = getAttributeValue(attributes, name);
  return value === undefined ? attr.value != null : value.trim() !== '';
}

/** True when the element has children that could render text */
export function hasRenderableChildren(node: JSXOpeningElementNode): boolean {
  const children = node.parent?.children ?? [];
  return children.some((child) => {
    if (child.type === 'JSXText') return (child.value ?? '').trim() !== '';
    if (child.type === 'JSXExpressionContainer') {
      return child.expression?.type !== 'JSXEmptyExpression';
    }
    return true; // nested elements and fragments may contain text
  });
}
