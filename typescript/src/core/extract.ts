/**
 * Element property extraction: state, intent, value and custom metadata
 */

import type { SemanticIntent, SemanticRole, StateType } from './types.js';
import { CUSTOM_INTENT_PATTERN, LIMITS, VALID_INTENTS } from './constants.js';
import type { ParseContext } from './context.js';
import { inputType } from './roles.js';
import { isSafeKey, sanitizeTarget } from './security.js';

type FormControl = Element & { value?: unknown; checked?: unknown };

const METADATA_PREFIX = 'data-semantic-';
const RESERVED_METADATA = new Set(['intent', 'id']);

/** `autocomplete` tokens that mark a field as holding a secret */
const SENSITIVE_AUTOCOMPLETE = /(^|\s)(current-password|new-password|one-time-code|cc-[a-z-]+)(\s|$)/i;

function isChecked(element: Element): boolean {
  const live = (element as FormControl).checked;
  return typeof live === 'boolean' ? live : element.hasAttribute('checked');
}

function isCssHidden(element: Element): boolean {
  const style = element.getAttribute('style');
  if (!style) return false;
  return /(^|;)\s*(display\s*:\s*none|visibility\s*:\s*hidden)/i.test(style);
}

/** Determine the current state of an element */
export function determineState(element: Element, role: SemanticRole): StateType {
  const tagName = element.tagName.toLowerCase();
  const aria = (name: string): string | null => element.getAttribute(`aria-${name}`);

  if (element.hasAttribute('hidden') || aria('hidden') === 'true') return 'hidden';
  if (tagName === 'input' && inputType(element) === 'hidden') return 'hidden';
  if (isCssHidden(element)) return 'hidden';

  if (element.hasAttribute('disabled') || element.hasAttribute('inert')) return 'disabled';
  if (aria('disabled') === 'true') return 'disabled';
  if (aria('busy') === 'true') return 'loading';
  if (aria('invalid') === 'true') return 'invalid';
  if (aria('selected') === 'true') return 'selected';
  if (aria('expanded') === 'true') return 'expanded';
  if (aria('expanded') === 'false') return 'collapsed';

  const checked = aria('checked') ?? aria('pressed');
  if (checked === 'true') return 'checked';
  if (checked === 'false') return 'unchecked';
  if (checked === 'mixed') return 'indeterminate';

  if (tagName === 'details') return element.hasAttribute('open') ? 'expanded' : 'collapsed';

  if (role === 'checkbox' || role === 'radio' || role === 'switch') {
    return tagName === 'input' && isChecked(element) ? 'checked' : 'unchecked';
  }

  return 'idle';
}

/** Extract boolean state flags that can hold alongside the primary state */
export function extractStateFlags(
  element: Element
): Partial<Record<StateType, boolean>> | undefined {
  const flags: Partial<Record<StateType, boolean>> = {};

  if (element.hasAttribute('disabled')) flags.disabled = true;
  if (element.hasAttribute('readonly') || element.getAttribute('aria-readonly') === 'true') {
    flags.readonly = true;
  }
  if (element.hasAttribute('required') || element.getAttribute('aria-required') === 'true') {
    flags.required = true;
  }

  return Object.keys(flags).length > 0 ? flags : undefined;
}

/** Keyword to intent table, checked in order against whole words of the name */
const BUTTON_INTENTS: ReadonlyArray<[RegExp, SemanticIntent]> = [
  [/\b(submit|send|save|apply|sign ?in|sign ?up|log ?in|register|subscribe)\b/, 'submit'],
  [/\b(search|find)\b/, 'search'],
  [/\b(cancel|abort)\b/, 'cancel'],
  [/\b(close|dismiss|hide)\b/, 'close'],
  [/\b(delete|remove|trash)\b/, 'delete'],
  [/\b(confirm|ok|okay|yes|accept|agree)\b/, 'confirm'],
  [/\b(edit|rename|modify)\b/, 'edit'],
  [/\b(add|create|new)\b/, 'create'],
  [/\b(download|export)\b/, 'download'],
  [/\b(upload|import|attach)\b/, 'upload'],
  [/\b(play|resume)\b/, 'play'],
  [/\b(pause)\b/, 'pause'],
  [/\b(stop)\b/, 'stop'],
  [/\b(copy)\b/, 'copy'],
  [/\b(undo)\b/, 'undo'],
  [/\b(redo)\b/, 'redo'],
  [/\b(filter)\b/, 'filter'],
  [/\b(sort)\b/, 'sort'],
  [/\b(next|previous|prev|more)\b/, 'paginate'],
  [/\b(open|show|view)\b/, 'open'],
];

function inferButtonIntent(element: Element, name: string): SemanticIntent {
  const tagName = element.tagName.toLowerCase();
  const type = (element.getAttribute('type') ?? '').toLowerCase();

  if (tagName === 'summary') return 'expand';
  if (type === 'file') return 'upload';
  if (type === 'submit' || type === 'image') return 'submit';
  if (type === 'reset') return 'cancel';

  const expanded = element.getAttribute('aria-expanded');
  if (expanded === 'true') return 'collapse';
  if (expanded === 'false') return 'expand';
  if (element.hasAttribute('aria-pressed')) return 'toggle';

  const text = name.toLowerCase();
  for (const [pattern, intent] of BUTTON_INTENTS) {
    if (pattern.test(text)) return intent;
  }

  if (element.hasAttribute('aria-haspopup')) return 'open';
  // A <button> inside a form submits it unless a type says otherwise.
  if (tagName === 'button' && type === '' && element.closest('form')) return 'submit';

  return 'action';
}

function declaredIntent(element: Element): SemanticIntent | undefined {
  const raw = element.getAttribute('data-semantic-intent')?.trim().toLowerCase();
  if (!raw) return undefined;
  // Unknown values are accepted only when they look like an identifier, so
  // page content cannot smuggle free text into the intent column.
  return VALID_INTENTS.has(raw) || CUSTOM_INTENT_PATTERN.test(raw)
    ? (raw as SemanticIntent)
    : undefined;
}

/** Determine the semantic intent for an element */
export function determineIntent(
  element: Element,
  role: SemanticRole,
  name: string,
  ctx: ParseContext
): SemanticIntent | undefined {
  const tagName = element.tagName.toLowerCase();
  if (Object.hasOwn(ctx.config.intentMapping, tagName)) {
    return ctx.config.intentMapping[tagName];
  }

  const declared = declaredIntent(element);
  if (declared) return declared;

  switch (role) {
    case 'link':
      return element.hasAttribute('download') ? 'download' : 'navigate';
    case 'navigation':
      return 'navigate';
    case 'button':
      return inferButtonIntent(element, name);
    case 'textbox':
    case 'spinbutton':
    case 'slider':
      return 'input';
    case 'searchbox':
    case 'search':
      return 'search';
    case 'checkbox':
    case 'radio':
    case 'switch':
      return 'toggle';
    case 'listbox':
    case 'combobox':
    case 'option':
    case 'tab':
    case 'menuitem':
    case 'treeitem':
      return 'select';
    case 'audio':
    case 'video':
      return 'play';
    case 'dialog':
      return 'open';
    case 'alert':
      return 'warn';
    default:
      return undefined;
  }
}

/** True for fields whose value must not leave the page */
export function isSensitiveField(element: Element): boolean {
  if (element.tagName.toLowerCase() !== 'input') {
    return SENSITIVE_AUTOCOMPLETE.test(element.getAttribute('autocomplete') ?? '');
  }
  const type = inputType(element);
  return (
    type === 'password' ||
    type === 'hidden' ||
    SENSITIVE_AUTOCOMPLETE.test(element.getAttribute('autocomplete') ?? '')
  );
}

function liveValue(element: Element): string {
  const live = (element as FormControl).value;
  return typeof live === 'string' ? live : (element.getAttribute('value') ?? '');
}

function numeric(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** Extract the current value of a form control or ranged widget */
export function extractValue(
  element: Element,
  ctx: ParseContext
): string | number | boolean | undefined {
  if (ctx.config.redactSensitiveValues && isSensitiveField(element)) return undefined;

  const tagName = element.tagName.toLowerCase();

  if (tagName === 'input') {
    const type = inputType(element);
    if (type === 'checkbox' || type === 'radio') return isChecked(element);
    if (type === 'file') return undefined;
    if (type === 'number' || type === 'range') return numeric(liveValue(element));
    return ctx.text(liveValue(element)) || undefined;
  }

  if (tagName === 'textarea' || tagName === 'select') {
    const live = (element as FormControl).value;
    const value = typeof live === 'string' ? live : element.textContent;
    return ctx.text(value) || undefined;
  }

  return numeric(element.getAttribute('aria-valuenow'));
}

function parseMetadataValue(raw: string, ctx: ParseContext): unknown {
  if (raw.length > LIMITS.maxMetadataValueLength) return ctx.text(raw);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return ctx.text(raw);
  }
}

/**
 * Extract custom metadata: `data-semantic-*` attributes plus sanitised
 * `href`/`src` targets so agents can see where a link or media element points.
 */
export function extractMetadata(
  element: Element,
  ctx: ParseContext
): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};
  let count = 0;

  for (const attr of Array.from(element.attributes)) {
    if (!attr.name.startsWith(METADATA_PREFIX)) continue;
    const key = attr.name.slice(METADATA_PREFIX.length);
    if (!isSafeKey(key) || RESERVED_METADATA.has(key)) continue;
    if (++count > LIMITS.maxMetadataKeys) break;
    metadata[key] = parseMetadataValue(attr.value, ctx);
  }

  // The element's real target wins over anything supplied via data-semantic-*.
  for (const name of ['href', 'src'] as const) {
    if (element.hasAttribute(name)) metadata[name] = element.getAttribute(name);
  }
  for (const name of ['href', 'src', 'url'] as const) {
    if (!(name in metadata)) continue;
    const target = sanitizeTarget(metadata[name]);
    if (target) metadata[name] = target;
    else delete metadata[name];
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}
