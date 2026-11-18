/**
 * Shared constants and defaults for SemanticDOM
 */

import type { SemanticDOMConfig, SemanticIntent, SemanticRole } from './types.js';

declare const __PKG_VERSION__: string | undefined;

/** Package version, injected at build time from package.json */
export const VERSION: string =
  typeof __PKG_VERSION__ === 'string' ? __PKG_VERSION__ : '0.0.0-dev';

/** Standard identifier written into every document */
export const STANDARD = 'ISO/IEC-SDOM-SSG-DRAFT-2024' as const;

/** Version of the SemanticDocument format */
export const DOCUMENT_VERSION = '1.0.0';

/** Hard ceilings that configuration cannot raise past */
export const LIMITS = {
  maxDepth: 512,
  maxNodes: 1_000_000,
  maxLabelLength: 2_000,
  maxUrlLength: 2_048,
  maxMetadataValueLength: 10_000,
  maxMetadataKeys: 32,
} as const;

/** Default configuration for SemanticDOM */
export const DEFAULT_CONFIG: Required<SemanticDOMConfig> = {
  computeBounds: true,
  includeStateGraph: true,
  maxDepth: 50,
  exclude: ['script', 'style', 'noscript', 'template'],
  include: [],
  roleMapping: {},
  intentMapping: {},
  generateIds: true,
  idPrefix: '',
  validate: true,
  targetCertification: 'standard',
  maxNodes: 50_000,
  maxLabelLength: 200,
  redactSensitiveValues: true,
};

/** Every role the parser will accept from a `role` attribute */
export const VALID_ROLES: ReadonlySet<string> = new Set<SemanticRole>([
  'document', 'article', 'section', 'navigation', 'main', 'header', 'footer',
  'aside', 'form', 'button', 'link', 'textbox', 'checkbox', 'radio', 'listbox',
  'option', 'menu', 'menuitem', 'dialog', 'alert', 'status', 'progressbar',
  'slider', 'tablist', 'tab', 'tabpanel', 'tree', 'treeitem', 'grid', 'gridcell',
  'row', 'rowgroup', 'columnheader', 'rowheader', 'img', 'figure', 'table',
  'heading', 'list', 'listitem', 'landmark', 'region', 'group', 'separator',
  'tooltip', 'search', 'switch', 'combobox', 'searchbox', 'spinbutton',
  'audio', 'video', 'generic',
]);

/** ARIA role names that map onto a differently named SemanticRole */
export const ROLE_ALIASES: Readonly<Record<string, SemanticRole>> = {
  banner: 'header',
  contentinfo: 'footer',
  complementary: 'aside',
  alertdialog: 'dialog',
  image: 'img',
  presentation: 'generic',
  none: 'generic',
  menuitemcheckbox: 'menuitem',
  menuitemradio: 'menuitem',
  cell: 'gridcell',
};

/** Known intents; other values must match CUSTOM_INTENT_PATTERN */
export const VALID_INTENTS: ReadonlySet<string> = new Set<SemanticIntent>([
  'navigate', 'submit', 'input', 'toggle', 'select', 'expand', 'collapse',
  'open', 'close', 'search', 'filter', 'sort', 'paginate', 'scroll', 'upload',
  'download', 'play', 'pause', 'stop', 'mute', 'unmute', 'zoom', 'edit',
  'delete', 'create', 'copy', 'paste', 'undo', 'redo', 'confirm', 'cancel',
  'dismiss', 'info', 'warn', 'error', 'action',
]);

/** Shape a custom `data-semantic-intent` value must have to be accepted */
export const CUSTOM_INTENT_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

/** Roles an agent can act on */
export const INTERACTIVE_ROLES: ReadonlySet<SemanticRole> = new Set<SemanticRole>([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'listbox', 'option',
  'menu', 'menuitem', 'slider', 'tab', 'treeitem', 'gridcell', 'switch',
  'combobox', 'searchbox', 'spinbutton', 'audio', 'video',
]);

/** Roles reported as landmarks */
export const LANDMARK_ROLES: readonly SemanticRole[] = [
  'main', 'navigation', 'header', 'footer', 'aside', 'section', 'article', 'search',
];

/** Roles whose accessible name may come from their text content */
export const NAME_FROM_CONTENT_ROLES: ReadonlySet<SemanticRole> = new Set<SemanticRole>([
  'button', 'link', 'heading', 'option', 'tab', 'menuitem', 'treeitem',
  'checkbox', 'radio', 'switch', 'gridcell', 'columnheader', 'rowheader',
  'row', 'tooltip',
]);

/** Certification levels from weakest to strongest */
export const CERTIFICATION_LEVELS = ['none', 'basic', 'standard', 'advanced', 'full'] as const;
