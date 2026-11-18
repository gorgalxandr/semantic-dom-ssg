/**
 * Tree traversal, querying and deterministic navigation
 */

import type {
  NavigationOptions,
  SemanticDocument,
  SemanticId,
  SemanticNode,
  SemanticQuery,
} from './types.js';
import { isInteractiveRole } from './roles.js';

/** Flatten a tree to document order without recursion */
export function flattenTree(root: SemanticNode): SemanticNode[] {
  const result: SemanticNode[] = [];
  const stack: SemanticNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop() as SemanticNode;
    result.push(node);
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]);
    }
  }

  return result;
}

function oneOf<T>(expected: T | T[] | undefined, actual: T | undefined): boolean {
  if (expected === undefined) return true;
  if (actual === undefined) return false;
  return Array.isArray(expected) ? expected.includes(actual) : expected === actual;
}

function textMatches(pattern: string | RegExp | undefined, ...candidates: string[]): boolean {
  if (pattern === undefined) return true;
  if (typeof pattern === 'string') {
    const needle = pattern.toLowerCase();
    return candidates.some((c) => c.toLowerCase().includes(needle));
  }
  return candidates.some((c) => {
    pattern.lastIndex = 0; // global/sticky regexes keep state between calls
    return pattern.test(c);
  });
}

/** Test a single node against a query */
export function matchesQuery(node: SemanticNode, query: SemanticQuery): boolean {
  if (!oneOf(query.role, node.role)) return false;
  if (!oneOf(query.intent, node.intent)) return false;
  if (!oneOf(query.state, node.state)) return false;
  if (!textMatches(query.label, node.label)) return false;
  if (!textMatches(query.text, node.label, node.a11y.name, node.a11y.description ?? '')) {
    return false;
  }
  if (query.interactive && !isInteractiveRole(node.role)) return false;
  if (query.visible && node.state === 'hidden') return false;
  if (query.focusable && !node.a11y.focusable) return false;
  if (query.filter && !query.filter(node)) return false;
  return true;
}

/** Query a subtree in document order */
export function queryNodes(root: SemanticNode, query: SemanticQuery): SemanticNode[] {
  const limit = query.limit && query.limit > 0 ? query.limit : Infinity;
  const candidates = query.deep === false ? [root] : flattenTree(root);
  const results: SemanticNode[] = [];

  for (const node of candidates) {
    if (!matchesQuery(node, query)) continue;
    results.push(node);
    if (results.length >= limit) break;
  }

  return results;
}

/** Navigate from one node to another */
export function navigateNodes(
  document: SemanticDocument,
  currentId: SemanticId,
  options: NavigationOptions
): SemanticNode | null {
  const current = document.index.get(currentId);
  if (!current) return null;

  const { direction, filter, wrap, skipHidden, focusableOnly } = options;

  const isValid = (node: SemanticNode): boolean => {
    if (skipHidden && node.state === 'hidden') return false;
    if (focusableOnly && !node.a11y.focusable) return false;
    return filter ? matchesQuery(node, filter) : true;
  };

  /** Scan `list` from `start` in steps of `delta`, optionally wrapping once */
  const scan = (list: SemanticNode[], start: number, delta: 1 | -1): SemanticNode | null => {
    for (let i = start + delta; i >= 0 && i < list.length; i += delta) {
      if (isValid(list[i])) return list[i];
    }
    if (!wrap) return null;
    for (let i = delta === 1 ? 0 : list.length - 1; i !== start; i += delta) {
      if (isValid(list[i])) return list[i];
    }
    return null;
  };

  switch (direction) {
    case 'parent':
      return current.parent ? (document.index.get(current.parent) ?? null) : null;

    case 'firstChild':
      return current.children.find(isValid) ?? null;

    case 'lastChild':
      return current.children.findLast(isValid) ?? null;

    case 'nextSibling':
    case 'previousSibling': {
      const parent = current.parent ? document.index.get(current.parent) : undefined;
      if (!parent) return null;
      const index = parent.children.findIndex((s) => s.id === currentId);
      if (index === -1) return null;
      return scan(parent.children, index, direction === 'nextSibling' ? 1 : -1);
    }

    case 'first':
      return flattenTree(document.root).find(isValid) ?? null;

    case 'last':
      return flattenTree(document.root).findLast(isValid) ?? null;

    case 'next':
    case 'previous': {
      // Position is taken from the full tree, so navigation still works when
      // the current node itself does not pass the filter.
      const all = flattenTree(document.root);
      const index = all.findIndex((n) => n.id === currentId);
      if (index === -1) return null;
      return scan(all, index, direction === 'next' ? 1 : -1);
    }

    default:
      return null;
  }
}
