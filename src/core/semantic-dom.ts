/**
 * SemanticDOM Core Implementation
 * Provides O(1) lookup and deterministic navigation
 */

import type {
  SemanticNode,
  SemanticId,
  SemanticDocument,
  SemanticRole,
  SemanticIntent,
  StateType,
  SemanticQuery,
  SemanticDOMConfig,
  NavigationOptions,
  SemanticA11y,
  SemanticBounds,
  SSGNode,
  StateTransition,
  AgentCertification,
  ValidationCheck,
} from './types.js';

/**
 * Default configuration for SemanticDOM
 */
const DEFAULT_CONFIG: Required<SemanticDOMConfig> = {
  computeBounds: true,
  includeStateGraph: true,
  maxDepth: 50,
  exclude: ['script', 'style', 'noscript', 'template'],
  include: [],
  roleMapping: {},
  intentMapping: {},
  generateIds: true,
  idPrefix: 'sdom',
  validate: true,
  targetCertification: 'standard',
};

/**
 * Role mapping from HTML elements to semantic roles
 */
const HTML_ROLE_MAP: Record<string, SemanticRole> = {
  a: 'link',
  article: 'article',
  aside: 'aside',
  button: 'button',
  dialog: 'dialog',
  footer: 'footer',
  form: 'form',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  header: 'header',
  img: 'img',
  input: 'textbox',
  li: 'listitem',
  main: 'main',
  nav: 'navigation',
  ol: 'list',
  option: 'option',
  section: 'section',
  select: 'listbox',
  table: 'table',
  textarea: 'textbox',
  ul: 'list',
};

/**
 * Input type to role mapping
 */
const INPUT_ROLE_MAP: Record<string, SemanticRole> = {
  button: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  submit: 'button',
  reset: 'button',
};

/**
 * Generate unique semantic ID
 */
export function generateSemanticId(
  prefix: string,
  role: SemanticRole,
  index: number
): SemanticId {
  const hash = Math.random().toString(36).substring(2, 8);
  return `sdom-${prefix}-${role}-${index}-${hash}` as SemanticId;
}

/**
 * SemanticDOM class for parsing and navigating semantic documents
 */
export class SemanticDOM {
  private config: Required<SemanticDOMConfig>;
  private index: Map<SemanticId, SemanticNode> = new Map();
  private stateGraph: Map<SemanticId, SSGNode> = new Map();
  private nodeCounter = 0;

  constructor(config: SemanticDOMConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Parse a DOM element into a SemanticDocument
   */
  parse(root: Element, url = '', title = ''): SemanticDocument {
    this.index.clear();
    this.stateGraph.clear();
    this.nodeCounter = 0;

    const semanticRoot = this.parseElement(root, 0);

    const document: SemanticDocument = {
      version: '1.0.0',
      standard: 'ISO/IEC-SDOM-SSG-DRAFT-2024',
      url,
      title: title || this.extractTitle(root),
      root: semanticRoot,
      index: this.index,
      stateGraph: this.stateGraph,
      landmarks: this.extractLandmarks(semanticRoot),
      interactables: this.extractInteractables(semanticRoot),
      language: this.extractLanguage(root),
      generatedAt: Date.now(),
      agentReady: this.config.validate
        ? this.certify(semanticRoot)
        : this.createEmptyCertification(),
    };

    return document;
  }

  /**
   * Parse a single element into a SemanticNode
   */
  private parseElement(element: Element, depth: number, parentId?: SemanticId): SemanticNode {
    if (depth > this.config.maxDepth) {
      return this.createGenericNode(element, parentId);
    }

    const tagName = element.tagName.toLowerCase();

    // Check exclusions
    if (this.config.exclude.includes(tagName)) {
      return this.createGenericNode(element, parentId);
    }

    const role = this.determineRole(element);
    const id = generateSemanticId(this.config.idPrefix, role, this.nodeCounter++);
    const state = this.determineState(element);
    const intent = this.determineIntent(element, role);
    const a11y = this.extractA11y(element, role);

    const node: SemanticNode = {
      id,
      role,
      label: this.extractLabel(element, a11y),
      intent,
      state,
      stateFlags: this.extractStateFlags(element),
      value: this.extractValue(element),
      element: typeof window !== 'undefined' ? element : undefined,
      selector: this.generateSelector(element),
      xpath: this.generateXPath(element),
      bounds: this.config.computeBounds ? this.computeBounds(element) : undefined,
      children: [],
      parent: parentId,
      a11y,
      metadata: this.extractMetadata(element),
      updatedAt: Date.now(),
    };

    // Index the node for O(1) lookup
    this.index.set(id, node);

    // Create SSG node if configured
    if (this.config.includeStateGraph && this.isInteractive(node)) {
      this.stateGraph.set(id, this.createSSGNode(node));
    }

    // Parse children
    const children = Array.from(element.children);
    node.children = children
      .filter((child) => !this.config.exclude.includes(child.tagName.toLowerCase()))
      .map((child) => this.parseElement(child, depth + 1, id));

    return node;
  }

  /**
   * Determine semantic role for an element
   */
  private determineRole(element: Element): SemanticRole {
    // Check explicit ARIA role
    const ariaRole = element.getAttribute('role');
    if (ariaRole && this.isValidRole(ariaRole)) {
      return ariaRole as SemanticRole;
    }

    // Check custom role mapping
    const tagName = element.tagName.toLowerCase();
    if (this.config.roleMapping[tagName]) {
      return this.config.roleMapping[tagName];
    }

    // Check input type
    if (tagName === 'input') {
      const inputType = element.getAttribute('type') || 'text';
      if (INPUT_ROLE_MAP[inputType]) {
        return INPUT_ROLE_MAP[inputType];
      }
    }

    // Use HTML role map
    if (HTML_ROLE_MAP[tagName]) {
      return HTML_ROLE_MAP[tagName];
    }

    return 'generic';
  }

  /**
   * Check if a role string is valid
   */
  private isValidRole(role: string): boolean {
    const validRoles: SemanticRole[] = [
      'document', 'article', 'section', 'navigation', 'main', 'header', 'footer',
      'aside', 'form', 'button', 'link', 'textbox', 'checkbox', 'radio', 'listbox',
      'option', 'menu', 'menuitem', 'dialog', 'alert', 'status', 'progressbar',
      'slider', 'tablist', 'tab', 'tabpanel', 'tree', 'treeitem', 'grid', 'gridcell',
      'row', 'rowgroup', 'columnheader', 'rowheader', 'img', 'figure', 'table',
      'heading', 'list', 'listitem', 'landmark', 'region', 'group', 'separator',
      'tooltip', 'generic',
    ];
    return validRoles.includes(role as SemanticRole);
  }

  /**
   * Determine current state of an element
   */
  private determineState(element: Element): StateType {
    if (element.hasAttribute('disabled')) return 'disabled';
    if (element.getAttribute('aria-disabled') === 'true') return 'disabled';
    if (element.getAttribute('aria-busy') === 'true') return 'loading';
    if (element.getAttribute('aria-invalid') === 'true') return 'invalid';
    if (element.getAttribute('aria-selected') === 'true') return 'selected';
    if (element.getAttribute('aria-expanded') === 'true') return 'expanded';
    if (element.getAttribute('aria-expanded') === 'false') return 'collapsed';
    if (element.getAttribute('aria-checked') === 'true') return 'checked';
    if (element.getAttribute('aria-checked') === 'false') return 'unchecked';
    if (element.getAttribute('aria-checked') === 'mixed') return 'indeterminate';
    if (element.hasAttribute('hidden')) return 'hidden';
    if (element.getAttribute('aria-hidden') === 'true') return 'hidden';

    return 'idle';
  }

  /**
   * Extract state flags from element
   */
  private extractStateFlags(element: Element): Partial<Record<StateType, boolean>> {
    const flags: Partial<Record<StateType, boolean>> = {};

    if (element.hasAttribute('disabled')) flags.disabled = true;
    if (element.hasAttribute('readonly')) flags.readonly = true;
    if (element.hasAttribute('required')) flags.required = true;
    if (element.getAttribute('aria-required') === 'true') flags.required = true;
    if (element.getAttribute('aria-readonly') === 'true') flags.readonly = true;

    return Object.keys(flags).length > 0 ? flags : undefined;
  }

  /**
   * Determine semantic intent for an element
   */
  private determineIntent(element: Element, role: SemanticRole): SemanticIntent | undefined {
    // Check custom intent mapping
    const tagName = element.tagName.toLowerCase();
    if (this.config.intentMapping[tagName]) {
      return this.config.intentMapping[tagName];
    }

    // Check data attribute
    const dataIntent = element.getAttribute('data-semantic-intent');
    if (dataIntent) {
      return dataIntent as SemanticIntent;
    }

    // Infer from role
    switch (role) {
      case 'link':
      case 'navigation':
        return 'navigate';
      case 'button':
        return this.inferButtonIntent(element);
      case 'textbox':
        return 'input';
      case 'checkbox':
      case 'radio':
        return 'toggle';
      case 'listbox':
      case 'option':
        return 'select';
      case 'dialog':
        return 'open';
      case 'alert':
        return 'warn';
      default:
        return undefined;
    }
  }

  /**
   * Infer intent from button attributes
   */
  private inferButtonIntent(element: Element): SemanticIntent {
    const type = element.getAttribute('type');
    const text = element.textContent?.toLowerCase() || '';
    const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';

    if (type === 'submit') return 'submit';
    if (text.includes('submit') || ariaLabel.includes('submit')) return 'submit';
    if (text.includes('search') || ariaLabel.includes('search')) return 'search';
    if (text.includes('cancel') || ariaLabel.includes('cancel')) return 'cancel';
    if (text.includes('close') || ariaLabel.includes('close')) return 'close';
    if (text.includes('delete') || ariaLabel.includes('delete')) return 'delete';
    if (text.includes('confirm') || ariaLabel.includes('confirm')) return 'confirm';

    return 'toggle';
  }

  /**
   * Extract accessibility properties
   */
  private extractA11y(element: Element, role: SemanticRole): SemanticA11y {
    const tagName = element.tagName.toLowerCase();

    return {
      name: this.computeAccessibleName(element),
      description: element.getAttribute('aria-describedby')
        ? this.getDescriptionById(element)
        : element.getAttribute('aria-description') || undefined,
      live: this.getLiveRegion(element),
      atomic: element.getAttribute('aria-atomic') === 'true',
      busy: element.getAttribute('aria-busy') === 'true',
      current: this.getCurrentValue(element),
      keyboardShortcut: element.getAttribute('aria-keyshortcuts') || undefined,
      tabIndex: element.hasAttribute('tabindex')
        ? parseInt(element.getAttribute('tabindex') || '0', 10)
        : undefined,
      focusable: this.isFocusable(element),
      inTabOrder: this.isInTabOrder(element),
      level: role === 'heading' ? this.getHeadingLevel(tagName) : undefined,
      posInSet: this.getPosInSet(element),
      setSize: this.getSetSize(element),
    };
  }

  /**
   * Compute accessible name for element
   */
  private computeAccessibleName(element: Element): string {
    // Priority: aria-labelledby > aria-label > native label > content
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelElement = element.ownerDocument?.getElementById(labelledBy);
      if (labelElement) {
        return labelElement.textContent?.trim() || '';
      }
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return ariaLabel;
    }

    // Check for associated label (for inputs)
    const id = element.getAttribute('id');
    if (id) {
      const label = element.ownerDocument?.querySelector(`label[for="${id}"]`);
      if (label) {
        return label.textContent?.trim() || '';
      }
    }

    // Use text content for buttons and links
    const tagName = element.tagName.toLowerCase();
    if (['button', 'a'].includes(tagName)) {
      return element.textContent?.trim() || '';
    }

    // Use alt for images
    if (tagName === 'img') {
      return element.getAttribute('alt') || '';
    }

    // Use title as fallback
    return element.getAttribute('title') || '';
  }

  /**
   * Get description by aria-describedby
   */
  private getDescriptionById(element: Element): string | undefined {
    const describedBy = element.getAttribute('aria-describedby');
    if (!describedBy) return undefined;

    const ids = describedBy.split(/\s+/);
    const descriptions = ids
      .map((id) => element.ownerDocument?.getElementById(id)?.textContent?.trim())
      .filter(Boolean);

    return descriptions.length > 0 ? descriptions.join(' ') : undefined;
  }

  /**
   * Get live region type
   */
  private getLiveRegion(element: Element): 'off' | 'polite' | 'assertive' | undefined {
    const live = element.getAttribute('aria-live');
    if (live === 'polite' || live === 'assertive' || live === 'off') {
      return live;
    }

    // Check for implicit live regions
    const role = element.getAttribute('role');
    if (role === 'alert') return 'assertive';
    if (role === 'status') return 'polite';

    return undefined;
  }

  /**
   * Get aria-current value
   */
  private getCurrentValue(
    element: Element
  ): 'page' | 'step' | 'location' | 'date' | 'time' | 'true' | 'false' | undefined {
    const current = element.getAttribute('aria-current');
    if (!current) return undefined;

    const validValues = ['page', 'step', 'location', 'date', 'time', 'true', 'false'] as const;
    return validValues.includes(current as (typeof validValues)[number])
      ? (current as (typeof validValues)[number])
      : undefined;
  }

  /**
   * Check if element is focusable
   */
  private isFocusable(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    const focusableTags = ['a', 'button', 'input', 'select', 'textarea'];
    const tabIndex = element.getAttribute('tabindex');

    if (element.hasAttribute('disabled')) return false;
    if (tabIndex === '-1') return true; // Programmatically focusable
    if (focusableTags.includes(tagName)) return true;
    if (tabIndex !== null) return true;
    if (element.getAttribute('contenteditable') === 'true') return true;

    return false;
  }

  /**
   * Check if element is in tab order
   */
  private isInTabOrder(element: Element): boolean {
    const tabIndex = element.getAttribute('tabindex');

    if (element.hasAttribute('disabled')) return false;
    if (tabIndex === '-1') return false;
    if (this.isFocusable(element)) return true;

    return false;
  }

  /**
   * Get heading level from tag name
   */
  private getHeadingLevel(tagName: string): number | undefined {
    const match = tagName.match(/^h([1-6])$/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Get position in set
   */
  private getPosInSet(element: Element): number | undefined {
    const posInSet = element.getAttribute('aria-posinset');
    return posInSet ? parseInt(posInSet, 10) : undefined;
  }

  /**
   * Get set size
   */
  private getSetSize(element: Element): number | undefined {
    const setSize = element.getAttribute('aria-setsize');
    return setSize ? parseInt(setSize, 10) : undefined;
  }

  /**
   * Extract label for node
   */
  private extractLabel(element: Element, a11y: SemanticA11y): string {
    if (a11y.name) return a11y.name;

    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');

    // Use tag name as fallback
    return role || tagName;
  }

  /**
   * Extract value from interactive elements
   */
  private extractValue(element: Element): string | number | boolean | undefined {
    const tagName = element.tagName.toLowerCase();

    if (tagName === 'input') {
      const type = element.getAttribute('type') || 'text';
      const value = element.getAttribute('value');

      if (type === 'checkbox' || type === 'radio') {
        return (element as HTMLInputElement).checked;
      }
      if (type === 'number' || type === 'range') {
        return value ? parseFloat(value) : undefined;
      }
      return value || undefined;
    }

    if (tagName === 'textarea' || tagName === 'select') {
      return element.textContent?.trim() || undefined;
    }

    // Check aria-valuenow for sliders
    const valueNow = element.getAttribute('aria-valuenow');
    if (valueNow) {
      return parseFloat(valueNow);
    }

    return undefined;
  }

  /**
   * Generate CSS selector for element
   */
  private generateSelector(element: Element): string {
    const parts: string[] = [];
    let current: Element | null = element;

    while (current && current !== current.ownerDocument?.documentElement) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        parts.unshift(selector);
        break;
      }

      const classes = Array.from(current.classList);
      if (classes.length > 0) {
        selector += `.${classes.map((c) => CSS.escape(c)).join('.')}`;
      }

      // Add nth-child for disambiguation
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (s) => s.tagName === current!.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  /**
   * Generate XPath for element
   */
  private generateXPath(element: Element): string {
    const parts: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === 1) {
      let index = 1;
      let sibling: Element | null = current.previousElementSibling;

      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }

      const tagName = current.tagName.toLowerCase();
      parts.unshift(`${tagName}[${index}]`);
      current = current.parentElement;
    }

    return '/' + parts.join('/');
  }

  /**
   * Compute bounding box for element
   */
  private computeBounds(element: Element): SemanticBounds | undefined {
    if (typeof window === 'undefined') return undefined;

    try {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Extract custom metadata from element
   */
  private extractMetadata(element: Element): Record<string, unknown> | undefined {
    const metadata: Record<string, unknown> = {};

    // Extract data-semantic-* attributes
    Array.from(element.attributes)
      .filter((attr) => attr.name.startsWith('data-semantic-'))
      .forEach((attr) => {
        const key = attr.name.replace('data-semantic-', '');
        try {
          metadata[key] = JSON.parse(attr.value);
        } catch {
          metadata[key] = attr.value;
        }
      });

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  /**
   * Check if node is interactive
   */
  private isInteractive(node: SemanticNode): boolean {
    const interactiveRoles: SemanticRole[] = [
      'button', 'link', 'textbox', 'checkbox', 'radio', 'listbox', 'option',
      'menu', 'menuitem', 'slider', 'tab', 'treeitem', 'gridcell',
    ];
    return interactiveRoles.includes(node.role);
  }

  /**
   * Create SSG node for state management
   */
  private createSSGNode(node: SemanticNode): SSGNode {
    return {
      semanticId: node.id,
      currentState: node.state,
      transitions: this.inferTransitions(node),
      history: [],
      maxHistory: 100,
      relations: [],
    };
  }

  /**
   * Infer state transitions based on role and current state
   */
  private inferTransitions(node: SemanticNode): StateTransition[] {
    const transitions: StateTransition[] = [];

    switch (node.role) {
      case 'button':
        transitions.push(
          { from: 'idle', to: 'loading', trigger: 'submit', actions: [{ type: 'emit', payload: 'click' }] },
          { from: 'loading', to: 'success', trigger: 'complete' },
          { from: 'loading', to: 'error', trigger: 'fail' },
          { from: 'success', to: 'idle', trigger: 'reset' },
          { from: 'error', to: 'idle', trigger: 'dismiss' }
        );
        break;

      case 'checkbox':
      case 'radio':
        transitions.push(
          { from: 'unchecked', to: 'checked', trigger: 'toggle' },
          { from: 'checked', to: 'unchecked', trigger: 'toggle' }
        );
        break;

      case 'textbox':
        transitions.push(
          { from: 'idle', to: 'focused', trigger: 'input' },
          { from: 'focused', to: 'valid', trigger: 'validate' },
          { from: 'focused', to: 'invalid', trigger: 'validate' },
          { from: 'valid', to: 'idle', trigger: 'blur' },
          { from: 'invalid', to: 'idle', trigger: 'blur' }
        );
        break;

      default:
        transitions.push(
          { from: 'idle', to: 'focused', trigger: 'focus' },
          { from: 'focused', to: 'idle', trigger: 'blur' }
        );
    }

    return transitions;
  }

  /**
   * Create a generic node for excluded/hidden elements
   */
  private createGenericNode(element: Element, parentId?: SemanticId): SemanticNode {
    const id = generateSemanticId(this.config.idPrefix, 'generic', this.nodeCounter++);

    return {
      id,
      role: 'generic',
      label: element.tagName.toLowerCase(),
      state: 'hidden',
      selector: this.generateSelector(element),
      xpath: this.generateXPath(element),
      children: [],
      parent: parentId,
      a11y: {
        name: '',
        focusable: false,
        inTabOrder: false,
      },
      updatedAt: Date.now(),
    };
  }

  /**
   * Extract document title
   */
  private extractTitle(root: Element): string {
    const doc = root.ownerDocument;
    if (doc) {
      return doc.title || '';
    }
    return '';
  }

  /**
   * Extract document language
   */
  private extractLanguage(root: Element): string {
    const doc = root.ownerDocument;
    if (doc) {
      return doc.documentElement.lang || 'en';
    }
    return 'en';
  }

  /**
   * Extract landmark elements
   */
  private extractLandmarks(root: SemanticNode): SemanticNode[] {
    const landmarkRoles: SemanticRole[] = [
      'main', 'navigation', 'header', 'footer', 'aside', 'section', 'article',
    ];

    return this.query(root, { role: landmarkRoles, deep: true });
  }

  /**
   * Extract interactive elements
   */
  private extractInteractables(root: SemanticNode): SemanticNode[] {
    return this.query(root, { interactive: true, deep: true });
  }

  /**
   * Query semantic nodes
   */
  query(root: SemanticNode, query: SemanticQuery): SemanticNode[] {
    const results: SemanticNode[] = [];

    const matches = (node: SemanticNode): boolean => {
      if (query.role) {
        const roles = Array.isArray(query.role) ? query.role : [query.role];
        if (!roles.includes(node.role)) return false;
      }

      if (query.intent) {
        const intents = Array.isArray(query.intent) ? query.intent : [query.intent];
        if (!node.intent || !intents.includes(node.intent)) return false;
      }

      if (query.state) {
        const states = Array.isArray(query.state) ? query.state : [query.state];
        if (!states.includes(node.state)) return false;
      }

      if (query.text) {
        const text = node.label || '';
        if (typeof query.text === 'string') {
          if (!text.toLowerCase().includes(query.text.toLowerCase())) return false;
        } else if (!query.text.test(text)) {
          return false;
        }
      }

      if (query.interactive && !this.isInteractive(node)) return false;
      if (query.visible && node.state === 'hidden') return false;
      if (query.focusable && !node.a11y.focusable) return false;
      if (query.filter && !query.filter(node)) return false;

      return true;
    };

    const traverse = (node: SemanticNode) => {
      if (matches(node)) {
        results.push(node);
        if (query.limit && results.length >= query.limit) return;
      }

      if (query.deep !== false) {
        for (const child of node.children) {
          if (query.limit && results.length >= query.limit) break;
          traverse(child);
        }
      }
    };

    traverse(root);
    return results;
  }

  /**
   * Navigate to next semantic node
   */
  navigate(
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
      if (filter) {
        const matches = this.query(node, { ...filter, deep: false });
        if (matches.length === 0) return false;
      }
      return true;
    };

    switch (direction) {
      case 'parent':
        if (!current.parent) return null;
        return document.index.get(current.parent) || null;

      case 'firstChild':
        return current.children.find(isValid) || null;

      case 'lastChild':
        return [...current.children].reverse().find(isValid) || null;

      case 'nextSibling':
      case 'previousSibling': {
        const parent = current.parent ? document.index.get(current.parent) : null;
        if (!parent) return null;

        const siblings = parent.children;
        const index = siblings.findIndex((s) => s.id === currentId);
        if (index === -1) return null;

        if (direction === 'nextSibling') {
          const next = siblings.slice(index + 1).find(isValid);
          return next || (wrap ? siblings.find(isValid) : null) || null;
        } else {
          const prev = siblings.slice(0, index).reverse().find(isValid);
          return prev || (wrap ? [...siblings].reverse().find(isValid) : null) || null;
        }
      }

      case 'next':
      case 'previous':
      case 'first':
      case 'last': {
        const all = this.flattenTree(document.root).filter(isValid);
        if (all.length === 0) return null;

        if (direction === 'first') return all[0];
        if (direction === 'last') return all[all.length - 1];

        const index = all.findIndex((n) => n.id === currentId);
        if (index === -1) return null;

        if (direction === 'next') {
          return all[index + 1] || (wrap ? all[0] : null);
        } else {
          return all[index - 1] || (wrap ? all[all.length - 1] : null);
        }
      }
    }
  }

  /**
   * Flatten tree to array
   */
  private flattenTree(root: SemanticNode): SemanticNode[] {
    const result: SemanticNode[] = [root];
    for (const child of root.children) {
      result.push(...this.flattenTree(child));
    }
    return result;
  }

  /**
   * Get node by ID (O(1) lookup)
   */
  getById(document: SemanticDocument, id: SemanticId): SemanticNode | undefined {
    return document.index.get(id);
  }

  /**
   * Certify document for agent readiness
   */
  private certify(root: SemanticNode): AgentCertification {
    const checks: ValidationCheck[] = [];

    // Structure checks
    checks.push(this.checkStructure(root));
    checks.push(this.checkLandmarks(root));

    // Accessibility checks
    checks.push(this.checkAccessibleNames(root));
    checks.push(this.checkHeadingHierarchy(root));
    checks.push(this.checkKeyboardNav(root));

    // Navigation checks
    checks.push(this.checkUniqueIds(root));
    checks.push(this.checkSelectors(root));

    // State checks
    checks.push(this.checkStateTransitions(root));

    // Interoperability checks
    checks.push(this.checkSemanticIntent(root));

    const passed = checks.filter((c) => c.passed);
    const failures = checks.filter((c) => !c.passed);
    const score = Math.round((passed.length / checks.length) * 100);

    let level: AgentCertification['level'] = 'none';
    if (score >= 90) level = 'full';
    else if (score >= 80) level = 'advanced';
    else if (score >= 70) level = 'standard';
    else if (score >= 50) level = 'basic';

    return {
      level,
      checks: passed,
      failures,
      score,
      certifiedAt: Date.now(),
    };
  }

  /**
   * Create empty certification
   */
  private createEmptyCertification(): AgentCertification {
    return {
      level: 'none',
      checks: [],
      failures: [],
      score: 0,
    };
  }

  /**
   * Check document structure
   */
  private checkStructure(root: SemanticNode): ValidationCheck {
    const hasMain = this.query(root, { role: 'main', deep: true }).length > 0;
    return {
      id: 'structure-main',
      name: 'Main landmark present',
      category: 'structure',
      passed: hasMain,
      message: hasMain
        ? 'Document has main landmark'
        : 'Document should have a main landmark',
      severity: hasMain ? undefined : 'warning',
    };
  }

  /**
   * Check for proper landmarks
   */
  private checkLandmarks(root: SemanticNode): ValidationCheck {
    const landmarks = this.query(root, {
      role: ['main', 'navigation', 'header', 'footer'],
      deep: true,
    });
    const hasEnough = landmarks.length >= 2;
    return {
      id: 'structure-landmarks',
      name: 'Sufficient landmarks',
      category: 'structure',
      passed: hasEnough,
      message: hasEnough
        ? `Found ${landmarks.length} landmarks`
        : 'Document should have at least 2 landmarks',
      severity: hasEnough ? undefined : 'warning',
    };
  }

  /**
   * Check accessible names
   */
  private checkAccessibleNames(root: SemanticNode): ValidationCheck {
    const interactables = this.query(root, { interactive: true, deep: true });
    const withNames = interactables.filter((n) => n.a11y.name.length > 0);
    const allNamed = interactables.length === 0 || withNames.length === interactables.length;

    return {
      id: 'a11y-names',
      name: 'Interactive elements have accessible names',
      category: 'a11y',
      passed: allNamed,
      message: allNamed
        ? 'All interactive elements have accessible names'
        : `${interactables.length - withNames.length} interactive elements missing accessible names`,
      severity: allNamed ? undefined : 'error',
      nodes: interactables.filter((n) => n.a11y.name.length === 0).map((n) => n.id),
    };
  }

  /**
   * Check heading hierarchy
   */
  private checkHeadingHierarchy(root: SemanticNode): ValidationCheck {
    const headings = this.query(root, { role: 'heading', deep: true });
    let valid = true;
    let lastLevel = 0;

    for (const heading of headings) {
      const level = heading.a11y.level || 1;
      if (level > lastLevel + 1) {
        valid = false;
        break;
      }
      lastLevel = level;
    }

    return {
      id: 'a11y-headings',
      name: 'Heading hierarchy valid',
      category: 'a11y',
      passed: valid,
      message: valid
        ? 'Heading levels follow proper hierarchy'
        : 'Heading levels skip levels (e.g., h1 to h3)',
      severity: valid ? undefined : 'warning',
    };
  }

  /**
   * Check keyboard navigation
   */
  private checkKeyboardNav(root: SemanticNode): ValidationCheck {
    const focusable = this.query(root, { focusable: true, deep: true });
    const inTabOrder = focusable.filter((n) => n.a11y.inTabOrder);
    const hasNav = inTabOrder.length > 0;

    return {
      id: 'navigation-keyboard',
      name: 'Keyboard navigation available',
      category: 'navigation',
      passed: hasNav,
      message: hasNav
        ? `${inTabOrder.length} elements in tab order`
        : 'No elements in keyboard tab order',
      severity: hasNav ? undefined : 'error',
    };
  }

  /**
   * Check unique IDs
   */
  private checkUniqueIds(root: SemanticNode): ValidationCheck {
    const ids = new Set<SemanticId>();
    const duplicates: SemanticId[] = [];

    const traverse = (node: SemanticNode) => {
      if (ids.has(node.id)) {
        duplicates.push(node.id);
      }
      ids.add(node.id);
      node.children.forEach(traverse);
    };

    traverse(root);
    const unique = duplicates.length === 0;

    return {
      id: 'navigation-unique-ids',
      name: 'All semantic IDs unique',
      category: 'navigation',
      passed: unique,
      message: unique ? 'All IDs are unique' : `${duplicates.length} duplicate IDs found`,
      severity: unique ? undefined : 'critical',
      nodes: duplicates,
    };
  }

  /**
   * Check selectors work
   */
  private checkSelectors(root: SemanticNode): ValidationCheck {
    // In browser, we could verify selectors. Here we just check they're not empty.
    const all = this.flattenTree(root);
    const withSelectors = all.filter((n) => n.selector && n.selector.length > 0);
    const valid = withSelectors.length === all.length;

    return {
      id: 'navigation-selectors',
      name: 'All nodes have valid selectors',
      category: 'navigation',
      passed: valid,
      message: valid
        ? 'All nodes have CSS selectors'
        : `${all.length - withSelectors.length} nodes missing selectors`,
      severity: valid ? undefined : 'error',
    };
  }

  /**
   * Check state transitions
   */
  private checkStateTransitions(root: SemanticNode): ValidationCheck {
    const interactive = this.query(root, { interactive: true, deep: true });
    const withStates = interactive.filter((n) => this.stateGraph.has(n.id));
    const coverage = interactive.length > 0 ? withStates.length / interactive.length : 1;
    const good = coverage >= 0.8;

    return {
      id: 'state-transitions',
      name: 'State transitions defined',
      category: 'state',
      passed: good,
      message: good
        ? `${Math.round(coverage * 100)}% state coverage`
        : 'Insufficient state transition coverage',
      severity: good ? undefined : 'warning',
    };
  }

  /**
   * Check semantic intents
   */
  private checkSemanticIntent(root: SemanticNode): ValidationCheck {
    const interactive = this.query(root, { interactive: true, deep: true });
    const withIntent = interactive.filter((n) => n.intent);
    const coverage = interactive.length > 0 ? withIntent.length / interactive.length : 1;
    const good = coverage >= 0.7;

    return {
      id: 'interop-intent',
      name: 'Semantic intents defined',
      category: 'interoperability',
      passed: good,
      message: good
        ? `${Math.round(coverage * 100)}% intent coverage`
        : 'Many interactive elements lack semantic intent',
      severity: good ? undefined : 'info',
    };
  }
}

/**
 * Create a new SemanticDOM instance
 */
export function createSemanticDOM(config?: SemanticDOMConfig): SemanticDOM {
  return new SemanticDOM(config);
}

/**
 * Parse an element directly
 */
export function parseElement(
  element: Element,
  config?: SemanticDOMConfig
): SemanticDocument {
  const sdom = createSemanticDOM(config);
  return sdom.parse(element);
}
