/**
 * CSS selector and XPath generation.
 *
 * Paths are built top-down while the tree is walked: each child derives its
 * path from its parent's, so the whole document costs O(n) instead of walking
 * to the root and scanning siblings for every element.
 */

import type { ParseContext } from './context.js';
import { cssEscape } from './security.js';

/** Location of one element */
export interface ElementPath {
  selector: string;
  xpath: string;
}

function sameTagPosition(element: Element): { index: number; total: number } {
  const parent = element.parentElement;
  if (!parent) return { index: 1, total: 1 };

  let index = 0;
  let total = 0;
  for (const sibling of Array.from(parent.children)) {
    if (sibling.tagName !== element.tagName) continue;
    total++;
    if (sibling === element) index = total;
  }
  return { index: index || 1, total: total || 1 };
}

function idSelector(element: Element, ctx: ParseContext): string | undefined {
  const id = element.getAttribute('id');
  return id && ctx.isUniqueId(id) ? `#${cssEscape(id)}` : undefined;
}

function step(tagName: string, index: number, total: number): string {
  return total > 1 ? `${tagName}:nth-of-type(${index})` : tagName;
}

/** Compute the path of the parse root by walking up to the document element */
export function rootPath(root: Element, ctx: ParseContext): ElementPath {
  const selectorParts: string[] = [];
  const xpathParts: string[] = [];
  let anchored = false;

  for (let current: Element | null = root; current; current = current.parentElement) {
    const tagName = current.tagName.toLowerCase();
    const { index, total } = sameTagPosition(current);
    xpathParts.unshift(`${tagName}[${index}]`);

    if (anchored) continue;
    const byId = idSelector(current, ctx);
    if (byId) {
      selectorParts.unshift(byId);
      anchored = true;
    } else {
      selectorParts.unshift(step(tagName, index, total));
    }
  }

  return { selector: selectorParts.join(' > '), xpath: '/' + xpathParts.join('/') };
}

/** Compute paths for all element children of `parent` in a single pass */
export function childPaths(
  parent: Element,
  parentPath: ElementPath,
  ctx: ParseContext
): Map<Element, ElementPath> {
  const children = Array.from(parent.children);
  const totals = new Map<string, number>();
  for (const child of children) {
    totals.set(child.tagName, (totals.get(child.tagName) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const paths = new Map<Element, ElementPath>();

  for (const child of children) {
    const index = (seen.get(child.tagName) ?? 0) + 1;
    seen.set(child.tagName, index);

    const tagName = child.tagName.toLowerCase();
    const selector =
      idSelector(child, ctx) ??
      `${parentPath.selector} > ${step(tagName, index, totals.get(child.tagName) ?? 1)}`;

    paths.set(child, { selector, xpath: `${parentPath.xpath}/${tagName}[${index}]` });
  }

  return paths;
}
