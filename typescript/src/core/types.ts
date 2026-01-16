/**
 * SemanticDOM & Semantic State Graph Types
 * Implementing ISO/IEC Draft Standard for Agentic Web Interoperability
 *
 * @packageDocumentation
 */

/**
 * Semantic role categories following ARIA specification
 */
export type SemanticRole =
  | 'document'
  | 'article'
  | 'section'
  | 'navigation'
  | 'main'
  | 'header'
  | 'footer'
  | 'aside'
  | 'form'
  | 'button'
  | 'link'
  | 'textbox'
  | 'checkbox'
  | 'radio'
  | 'listbox'
  | 'option'
  | 'menu'
  | 'menuitem'
  | 'dialog'
  | 'alert'
  | 'status'
  | 'progressbar'
  | 'slider'
  | 'tablist'
  | 'tab'
  | 'tabpanel'
  | 'tree'
  | 'treeitem'
  | 'grid'
  | 'gridcell'
  | 'row'
  | 'rowgroup'
  | 'columnheader'
  | 'rowheader'
  | 'img'
  | 'figure'
  | 'table'
  | 'heading'
  | 'list'
  | 'listitem'
  | 'landmark'
  | 'region'
  | 'group'
  | 'separator'
  | 'tooltip'
  | 'generic';

/**
 * Semantic intent types for agent understanding
 */
export type SemanticIntent =
  | 'navigate'
  | 'submit'
  | 'input'
  | 'toggle'
  | 'select'
  | 'expand'
  | 'collapse'
  | 'open'
  | 'close'
  | 'search'
  | 'filter'
  | 'sort'
  | 'paginate'
  | 'scroll'
  | 'upload'
  | 'download'
  | 'play'
  | 'pause'
  | 'stop'
  | 'mute'
  | 'unmute'
  | 'zoom'
  | 'edit'
  | 'delete'
  | 'create'
  | 'copy'
  | 'paste'
  | 'undo'
  | 'redo'
  | 'confirm'
  | 'cancel'
  | 'dismiss'
  | 'info'
  | 'warn'
  | 'error';

/**
 * State types for Semantic State Graph
 */
export type StateType =
  | 'idle'
  | 'loading'
  | 'success'
  | 'error'
  | 'disabled'
  | 'enabled'
  | 'selected'
  | 'unselected'
  | 'expanded'
  | 'collapsed'
  | 'checked'
  | 'unchecked'
  | 'indeterminate'
  | 'focused'
  | 'blurred'
  | 'valid'
  | 'invalid'
  | 'required'
  | 'optional'
  | 'readonly'
  | 'editable'
  | 'visible'
  | 'hidden'
  | 'dragging'
  | 'dropping';

/**
 * Semantic node identifier - unique within document context
 * Format: [prefix]-[semantic-type]-[hash]
 */
export type SemanticId = `sdom-${string}`;

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

/**
 * State transition in Semantic State Graph
 */
export interface StateTransition {
  /**
   * Source state
   */
  from: StateType;

  /**
   * Target state
   */
  to: StateType;

  /**
   * Trigger that causes transition
   */
  trigger: SemanticIntent | string;

  /**
   * Conditions for transition
   */
  conditions?: TransitionCondition[];

  /**
   * Actions to execute on transition
   */
  actions?: TransitionAction[];
}

/**
 * Condition for state transition
 */
export interface TransitionCondition {
  type: 'state' | 'value' | 'context' | 'custom';
  check: string;
  expected: unknown;
}

/**
 * Action to execute during state transition
 */
export interface TransitionAction {
  type: 'emit' | 'update' | 'invoke' | 'log';
  target?: string;
  payload?: unknown;
}

/**
 * Semantic State Graph node
 */
export interface SSGNode {
  /**
   * Reference to semantic node
   */
  semanticId: SemanticId;

  /**
   * Current state
   */
  currentState: StateType;

  /**
   * Available state transitions
   */
  transitions: StateTransition[];

  /**
   * State history for debugging
   */
  history: StateHistoryEntry[];

  /**
   * Maximum history entries to keep
   */
  maxHistory: number;

  /**
   * Related nodes in the graph
   */
  relations: SSGRelation[];
}

/**
 * State history entry
 */
export interface StateHistoryEntry {
  from: StateType;
  to: StateType;
  trigger: string;
  timestamp: number;
}

/**
 * Relation between SSG nodes
 */
export interface SSGRelation {
  type: 'controls' | 'controlled-by' | 'flows-to' | 'flows-from' | 'describes' | 'described-by';
  targetId: SemanticId;
}

/**
 * SemanticDOM document representation
 */
export interface SemanticDocument {
  /**
   * Document version
   */
  version: string;

  /**
   * ISO/IEC draft standard reference
   */
  standard: 'ISO/IEC-SDOM-SSG-DRAFT-2024';

  /**
   * Document URL
   */
  url: string;

  /**
   * Document title
   */
  title: string;

  /**
   * Root semantic node
   */
  root: SemanticNode;

  /**
   * Flat index for O(1) lookup
   */
  index: Map<SemanticId, SemanticNode>;

  /**
   * Semantic State Graph
   */
  stateGraph: Map<SemanticId, SSGNode>;

  /**
   * Landmarks for quick navigation
   */
  landmarks: SemanticNode[];

  /**
   * Interactive elements
   */
  interactables: SemanticNode[];

  /**
   * Document language
   */
  language: string;

  /**
   * Generation timestamp
   */
  generatedAt: number;

  /**
   * Agent certification level
   */
  agentReady: AgentCertification;
}

/**
 * Agent certification levels
 */
export interface AgentCertification {
  /**
   * Certification level
   */
  level: 'none' | 'basic' | 'standard' | 'advanced' | 'full';

  /**
   * Passed validation checks
   */
  checks: ValidationCheck[];

  /**
   * Failed validation checks
   */
  failures: ValidationCheck[];

  /**
   * Certification score (0-100)
   */
  score: number;

  /**
   * Certification timestamp
   */
  certifiedAt?: number;
}

/**
 * Validation check result
 */
export interface ValidationCheck {
  /**
   * Check identifier
   */
  id: string;

  /**
   * Check name
   */
  name: string;

  /**
   * Check category
   */
  category: 'structure' | 'a11y' | 'navigation' | 'state' | 'interoperability';

  /**
   * Whether check passed
   */
  passed: boolean;

  /**
   * Check message
   */
  message: string;

  /**
   * Severity if failed
   */
  severity?: 'info' | 'warning' | 'error' | 'critical';

  /**
   * Related nodes
   */
  nodes?: SemanticId[];
}

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
   * Elements to exclude (selectors)
   */
  exclude?: string[];

  /**
   * Elements to include (selectors)
   */
  include?: string[];

  /**
   * Custom role mappings
   */
  roleMapping?: Record<string, SemanticRole>;

  /**
   * Custom intent mappings
   */
  intentMapping?: Record<string, SemanticIntent>;

  /**
   * Generate unique IDs
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
