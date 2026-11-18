import type { SemanticId, SemanticIntent, SemanticRole, StateType } from './vocabulary.js';

/**
 * Core SemanticDOM node interface
 * Represents a single element with semantic annotations
 */
export interface SemanticNode {
  /**
   * Unique identifier for O(1) lookup
   */
  id: SemanticId;

  /**
   * Semantic role following ARIA specification
   */
  role: SemanticRole;

  /**
   * Human-readable label for the element
   */
  label: string;

  /**
   * Semantic intent for agent understanding
   */
  intent?: SemanticIntent;

  /**
   * Current state of the element
   */
  state: StateType;

  /**
   * Additional state flags
   */
  stateFlags?: Partial<Record<StateType, boolean>>;

  /**
   * Value for interactive elements
   */
  value?: string | number | boolean;

  /**
   * Reference to DOM element (browser only)
   */
  element?: Element;

  /**
   * CSS selector path for element location
   */
  selector: string;

  /**
   * XPath for precise element location
   */
  xpath: string;

  /**
   * Bounding box coordinates (if computed)
   */
  bounds?: SemanticBounds;

  /**
   * Child nodes in semantic hierarchy
   */
  children: SemanticNode[];

  /**
   * Parent node reference
   */
  parent?: SemanticId;

  /**
   * Accessibility properties
   */
  a11y: SemanticA11y;

  /**
   * Custom metadata for domain-specific semantics
   */
  metadata?: Record<string, unknown>;

  /**
   * Timestamp of last semantic update
   */
  updatedAt: number;
}

/**
 * Bounding box for element positioning
 */
export interface SemanticBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Accessibility properties for a semantic node
 */
export interface SemanticA11y {
  /**
   * Accessible name
   */
  name: string;

  /**
   * Accessible description
   */
  description?: string;

  /**
   * ARIA live region type
   */
  live?: 'off' | 'polite' | 'assertive';

  /**
   * ARIA atomic property
   */
  atomic?: boolean;

  /**
   * ARIA busy state
   */
  busy?: boolean;

  /**
   * ARIA current property
   */
  current?: 'page' | 'step' | 'location' | 'date' | 'time' | 'true' | 'false';

  /**
   * Keyboard shortcut
   */
  keyboardShortcut?: string;

  /**
   * Tab index for keyboard navigation
   */
  tabIndex?: number;

  /**
   * Whether element is focusable
   */
  focusable: boolean;

  /**
   * Whether element is in tab order
   */
  inTabOrder: boolean;

  /**
   * Heading level (1-6 for headings)
   */
  level?: number;

  /**
   * Position in set (for list items, etc.)
   */
  posInSet?: number;

  /**
   * Size of set
   */
  setSize?: number;
}
