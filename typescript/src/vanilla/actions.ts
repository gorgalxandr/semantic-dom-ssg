/**
 * Browser actions on semantic nodes
 */

import type { SemanticDocument, SemanticId } from '../core/types.js';

/**
 * Find element by semantic ID
 */
export function findElement(document: SemanticDocument, id: SemanticId): Element | null {
  const node = document.index.get(id);
  if (!node) return null;

  // Prefer the element reference while it is still attached to the page.
  if (node.element && typeof node.element === 'object' && node.element.isConnected !== false) {
    return node.element;
  }

  // Fall back to the selector. `document` here is the SemanticDocument, so the
  // page's DOM is reached through globalThis.
  const dom = (globalThis as { document?: Document }).document;
  if (!dom || !node.selector) return null;
  try {
    return dom.querySelector(node.selector);
  } catch {
    return null;
  }
}

/**
 * Click on a semantic node (browser only)
 */
export function click(document: SemanticDocument, id: SemanticId): boolean {
  const element = findElement(document, id);
  if (!element || typeof (element as HTMLElement).click !== 'function') return false;

  (element as HTMLElement).click();
  return true;
}

/**
 * Focus on a semantic node (browser only)
 */
export function focus(document: SemanticDocument, id: SemanticId): boolean {
  const element = findElement(document, id);
  if (!element || typeof (element as HTMLElement).focus !== 'function') return false;

  (element as HTMLElement).focus();
  return true;
}

/**
 * Set value on a semantic node (browser only)
 */
export function setValue(
  document: SemanticDocument,
  id: SemanticId,
  value: string
): boolean {
  const element = findElement(document, id);
  if (!element) return false;

  const tagName = element.tagName.toLowerCase();
  if (tagName !== 'input' && tagName !== 'textarea' && tagName !== 'select') return false;

  const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (control.disabled || (control as HTMLInputElement).readOnly) return false;

  // Use the prototype's setter so frameworks that track the value property
  // (React) see the change, then fire the events a user edit would fire.
  const view = element.ownerDocument?.defaultView;
  const proto =
    tagName === 'input'
      ? view?.HTMLInputElement?.prototype
      : tagName === 'textarea'
        ? view?.HTMLTextAreaElement?.prototype
        : view?.HTMLSelectElement?.prototype;
  const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : undefined;
  if (descriptor?.set) descriptor.set.call(control, value);
  else control.value = value;

  const EventCtor = view?.Event ?? Event;
  if (tagName !== 'select') control.dispatchEvent(new EventCtor('input', { bubbles: true }));
  control.dispatchEvent(new EventCtor('change', { bubbles: true }));
  return true;
}

