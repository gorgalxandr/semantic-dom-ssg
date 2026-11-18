/**
 * Role resolution: explicit ARIA role, then configuration, then HTML semantics
 */

import type { SemanticRole } from './types.js';
import { INTERACTIVE_ROLES, ROLE_ALIASES, VALID_ROLES } from './constants.js';
import type { ResolvedConfig } from './context.js';

/** Implicit roles of HTML elements */
const HTML_ROLE_MAP: Readonly<Record<string, SemanticRole>> = {
  article: 'article',
  aside: 'aside',
  audio: 'audio',
  button: 'button',
  details: 'group',
  dialog: 'dialog',
  fieldset: 'group',
  figure: 'figure',
  footer: 'footer',
  form: 'form',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  header: 'header',
  hr: 'separator',
  img: 'img',
  li: 'listitem',
  main: 'main',
  menu: 'list',
  nav: 'navigation',
  ol: 'list',
  optgroup: 'group',
  option: 'option',
  output: 'status',
  progress: 'progressbar',
  search: 'search',
  section: 'section',
  select: 'listbox',
  summary: 'button',
  table: 'table',
  tbody: 'rowgroup',
  textarea: 'textbox',
  tfoot: 'rowgroup',
  th: 'columnheader',
  thead: 'rowgroup',
  tr: 'row',
  ul: 'list',
  video: 'video',
};

/** Roles of `<input>` by type; anything not listed is a textbox */
const INPUT_ROLE_MAP: Readonly<Record<string, SemanticRole>> = {
  button: 'button',
  checkbox: 'checkbox',
  file: 'button',
  hidden: 'generic',
  image: 'button',
  number: 'spinbutton',
  radio: 'radio',
  range: 'slider',
  reset: 'button',
  search: 'searchbox',
  submit: 'button',
};

/** Lower-cased `type` of an input element, defaulting to "text" */
export function inputType(element: Element): string {
  return (element.getAttribute('type') || 'text').trim().toLowerCase();
}

/** Resolve the first usable token of a `role` attribute */
export function explicitRole(element: Element): SemanticRole | undefined {
  const attr = element.getAttribute('role');
  if (!attr) return undefined;

  for (const token of attr.toLowerCase().split(/\s+/)) {
    if (!token) continue;
    if (Object.hasOwn(ROLE_ALIASES, token)) return ROLE_ALIASES[token];
    if (VALID_ROLES.has(token)) return token as SemanticRole;
  }
  return undefined;
}

/** Determine the semantic role for an element */
export function determineRole(element: Element, config: ResolvedConfig): SemanticRole {
  const fromAttr = explicitRole(element);
  if (fromAttr) return fromAttr;

  const tagName = element.tagName.toLowerCase();

  if (Object.hasOwn(config.roleMapping, tagName)) {
    const mapped = config.roleMapping[tagName];
    if (VALID_ROLES.has(mapped)) return mapped;
  }

  if (tagName === 'input') {
    return INPUT_ROLE_MAP[inputType(element)] ?? 'textbox';
  }

  // An anchor without href is not a link.
  if (tagName === 'a' || tagName === 'area') {
    return element.hasAttribute('href') ? 'link' : 'generic';
  }

  return Object.hasOwn(HTML_ROLE_MAP, tagName) ? HTML_ROLE_MAP[tagName] : 'generic';
}

/** True for roles an agent can act on */
export function isInteractiveRole(role: SemanticRole): boolean {
  return INTERACTIVE_ROLES.has(role);
}
