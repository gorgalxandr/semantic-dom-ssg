import type { SemanticIntent, SemanticRole, StateType } from './vocabulary.js';
import type { SemanticNode } from './node.js';
import type { AgentCertification } from './document.js';

/**
 * Query options for semantic search
 */
export interface SemanticQuery {
  /**
   * Filter by role
   */
  role?: SemanticRole | SemanticRole[];

  /**
   * Filter by intent
   */
  intent?: SemanticIntent | SemanticIntent[];

  /**
   * Filter by state
   */
  state?: StateType | StateType[];

  /**
   * Text content search
   */
  text?: string | RegExp;

  /**
   * Label search
   */
  label?: string | RegExp;

  /**
   * Only interactive elements
   */
  interactive?: boolean;

  /**
   * Only visible elements
   */
  visible?: boolean;

  /**
   * Only focusable elements
   */
  focusable?: boolean;

  /**
   * Custom filter function
   */
  filter?: (node: SemanticNode) => boolean;

  /**
   * Maximum results
   */
  limit?: number;

  /**
   * Include descendants
   */
  deep?: boolean;
}

/**
 * Navigation direction for deterministic traversal
 */
export type NavigationDirection =
  | 'next'
  | 'previous'
  | 'first'
  | 'last'
  | 'parent'
  | 'firstChild'
  | 'lastChild'
  | 'nextSibling'
  | 'previousSibling';

/**
 * Navigation options
 */
export interface NavigationOptions {
  /**
   * Direction to navigate
   */
  direction: NavigationDirection;

  /**
   * Filter during navigation
   */
  filter?: SemanticQuery;

  /**
   * Wrap around at boundaries
   */
  wrap?: boolean;

  /**
   * Skip hidden elements
   */
  skipHidden?: boolean;

  /**
   * Only navigate focusable elements
   */
  focusableOnly?: boolean;
}

/**
 * Configuration for SemanticDOM generation
 */
export interface SemanticDOMConfig {
  /**
   * Include computed bounds
   */
  computeBounds?: boolean;

  /**
   * Include state graph
   */
  includeStateGraph?: boolean;

  /**
   * Maximum tree depth
   */
  maxDepth?: number;

  /**
   * Elements to leave out of the semantic tree, together with their subtree.
   * Each entry is a tag name or a CSS selector.
   */
  exclude?: string[];

  /**
   * Elements that are always kept even if they match `exclude`.
   * Each entry is a tag name or a CSS selector.
   */
  include?: string[];

  /**
   * Maximum number of nodes to produce (default 50,000). Parsing stops
   * descending once reached and the document is flagged `truncated`.
   */
  maxNodes?: number;

  /**
   * Maximum length of labels and accessible names (default 200)
   */
  maxLabelLength?: number;

  /**
   * Omit values of password, hidden, payment and one-time-code fields
   * (default true). Disable only when the output never leaves the page.
   */
  redactSensitiveValues?: boolean;

  /**
   * Custom role mappings
   */
  roleMapping?: Record<string, SemanticRole>;

  /**
   * Custom intent mappings
   */
  intentMapping?: Record<string, SemanticIntent>;

  /**
   * Generate IDs from element structure (default true). When false, an
   * element's own `id` attribute is used as its semantic ID where present.
   * `data-semantic-id` always takes precedence.
   */
  generateIds?: boolean;

  /**
   * ID prefix
   */
  idPrefix?: string;

  /**
   * Validate during generation
   */
  validate?: boolean;

  /**
   * Certification level to target
   */
  targetCertification?: AgentCertification['level'];
}
