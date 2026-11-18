/**
 * Accessibility extraction: accessible name, focusability and ARIA properties
 */

import type { SemanticA11y, SemanticRole } from './types.js';
import { NAME_FROM_CONTENT_ROLES } from './constants.js';
import type { ParseContext } from './context.js';
import { inputType } from './roles.js';

const LABELABLE_TAGS: ReadonlySet<string> = new Set([
  'input', 'select', 'textarea', 'button', 'meter', 'output', 'progress',
]);

const NATIVELY_FOCUSABLE: ReadonlySet<string> = new Set([
  'button', 'input', 'select', 'textarea', 'summary',
]);

const CURRENT_VALUES = ['page', 'step', 'location', 'date', 'time', 'true', 'false'] as const;
type CurrentValue = (typeof CURRENT_VALUES)[number];

function intAttr(element: Element, name: string): number | undefined {
  const raw = element.getAttribute(name);
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : undefined;
}

function idRefs(element: Element, attr: string): string[] {
  return (element.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean);
}

/** Text of a direct child element with the given tag, e.g. legend or caption */
function childText(element: Element, tag: string, ctx: ParseContext): string {
  for (const child of Array.from(element.children)) {
    if (child.tagName.toLowerCase() === tag) return ctx.text(child.textContent);
  }
  return '';
}

function nativeName(element: Element, tagName: string, ctx: ParseContext): string {
  if (LABELABLE_TAGS.has(tagName)) {
    const id = element.getAttribute('id');
    const explicit = id ? ctx.labelFor(id) : '';
    if (explicit) return explicit;

    const wrapping = element.closest('label');
    if (wrapping) {
      const text = ctx.text(wrapping.textContent);
      if (text) return text;
    }
  }

  if (tagName === 'input') {
    const type = inputType(element);
    if (type === 'image') return ctx.text(element.getAttribute('alt'));
    if (type === 'submit' || type === 'reset' || type === 'button') {
      const value = ctx.text(element.getAttribute('value'));
      if (value) return value;
      if (type === 'submit') return 'Submit';
      if (type === 'reset') return 'Reset';
    }
    return '';
  }

  if (tagName === 'img' || tagName === 'area') return ctx.text(element.getAttribute('alt'));
  if (tagName === 'fieldset') return childText(element, 'legend', ctx);
  if (tagName === 'figure') return childText(element, 'figcaption', ctx);
  if (tagName === 'table') return childText(element, 'caption', ctx);

  return '';
}

/**
 * Compute an accessible name.
 * Order: aria-labelledby, aria-label, native labelling, text content (for
 * roles that allow it), then title and placeholder as last resorts.
 */
export function computeAccessibleName(
  element: Element,
  role: SemanticRole,
  ctx: ParseContext
): string {
  const labelledBy = idRefs(element, 'aria-labelledby')
    .map((id) => ctx.textOfId(id))
    .filter(Boolean)
    .join(' ');
  if (labelledBy) return ctx.text(labelledBy);

  const ariaLabel = ctx.text(element.getAttribute('aria-label'));
  if (ariaLabel) return ariaLabel;

  const tagName = element.tagName.toLowerCase();
  const native = nativeName(element, tagName, ctx);
  if (native) return native;

  if (NAME_FROM_CONTENT_ROLES.has(role) && tagName !== 'input') {
    const content = ctx.text(element.textContent);
    if (content) return content;
  }

  return (
    ctx.text(element.getAttribute('title')) || ctx.text(element.getAttribute('placeholder'))
  );
}

function isDisabled(element: Element): boolean {
  return element.hasAttribute('disabled') || element.hasAttribute('inert');
}

/** Check whether an element can receive focus */
export function isFocusable(element: Element): boolean {
  if (isDisabled(element)) return false;

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'input') return inputType(element) !== 'hidden';
  if (NATIVELY_FOCUSABLE.has(tagName)) return true;
  if ((tagName === 'a' || tagName === 'area') && element.hasAttribute('href')) return true;
  if ((tagName === 'audio' || tagName === 'video') && element.hasAttribute('controls')) return true;
  if (intAttr(element, 'tabindex') !== undefined) return true;

  const editable = element.getAttribute('contenteditable');
  return editable !== null && editable.toLowerCase() !== 'false';
}

/** Check whether an element is reachable with the Tab key */
export function isInTabOrder(element: Element): boolean {
  const tabIndex = intAttr(element, 'tabindex');
  if (tabIndex !== undefined && tabIndex < 0) return false;
  return isFocusable(element);
}

function describedBy(element: Element, ctx: ParseContext): string | undefined {
  const text = idRefs(element, 'aria-describedby')
    .map((id) => ctx.textOfId(id))
    .filter(Boolean)
    .join(' ');
  return ctx.text(text || element.getAttribute('aria-description')) || undefined;
}

function liveRegion(element: Element, role: SemanticRole): SemanticA11y['live'] {
  const live = element.getAttribute('aria-live');
  if (live === 'polite' || live === 'assertive' || live === 'off') return live;
  if (role === 'alert') return 'assertive';
  if (role === 'status') return 'polite';
  return undefined;
}

function headingLevel(element: Element): number | undefined {
  const ariaLevel = intAttr(element, 'aria-level');
  if (ariaLevel !== undefined && ariaLevel >= 1) return ariaLevel;
  const match = /^h([1-6])$/i.exec(element.tagName);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

/** Extract accessibility properties for an element */
export function extractA11y(element: Element, role: SemanticRole, ctx: ParseContext): SemanticA11y {
  const current = element.getAttribute('aria-current');

  return {
    name: computeAccessibleName(element, role, ctx),
    description: describedBy(element, ctx),
    live: liveRegion(element, role),
    atomic: element.getAttribute('aria-atomic') === 'true',
    busy: element.getAttribute('aria-busy') === 'true',
    current: CURRENT_VALUES.includes(current as CurrentValue)
      ? (current as CurrentValue)
      : undefined,
    keyboardShortcut: ctx.text(element.getAttribute('aria-keyshortcuts')) || undefined,
    tabIndex: intAttr(element, 'tabindex'),
    focusable: isFocusable(element),
    inTabOrder: isInTabOrder(element),
    level: role === 'heading' ? headingLevel(element) : undefined,
    posInSet: intAttr(element, 'aria-posinset'),
    setSize: intAttr(element, 'aria-setsize'),
  };
}
