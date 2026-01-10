/**
 * SemanticDOM Vanilla JavaScript Implementation
 * Framework-agnostic API for browser and Node.js environments
 *
 * @packageDocumentation
 */

import type {
  SemanticDocument,
  SemanticNode,
  SemanticId,
  SemanticQuery,
  SemanticDOMConfig,
  NavigationOptions,
  StateType,
  StateTransition,
  SSGNode,
  AgentCertification,
} from '../core/types.js';
import { SemanticDOM, createSemanticDOM } from '../core/semantic-dom.js';

/**
 * Global SemanticDOM instance for convenience methods
 */
let globalInstance: SemanticDOM | null = null;

/**
 * Initialize SemanticDOM with configuration
 */
export function init(config?: SemanticDOMConfig): SemanticDOM {
  globalInstance = createSemanticDOM(config);
  return globalInstance;
}

/**
 * Get or create global instance
 */
function getInstance(): SemanticDOM {
  if (!globalInstance) {
    globalInstance = createSemanticDOM();
  }
  return globalInstance;
}

/**
 * Parse the current document or a specific element
 */
export function parse(element?: Element): SemanticDocument {
  const sdom = getInstance();
  const target = element || (typeof document !== 'undefined' ? document.body : null);

  if (!target) {
    throw new Error('No element to parse. Provide an element or run in browser context.');
  }

  const url = typeof window !== 'undefined' ? window.location.href : '';
  const title = typeof document !== 'undefined' ? document.title : '';

  return sdom.parse(target, url, title);
}

/**
 * Parse HTML string into SemanticDocument
 */
export function parseHTML(html: string, config?: SemanticDOMConfig): SemanticDocument {
  if (typeof DOMParser === 'undefined') {
    throw new Error('DOMParser not available. Use in browser or with JSDOM.');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const sdom = createSemanticDOM(config);

  return sdom.parse(doc.body, '', doc.title);
}

/**
 * Query semantic nodes
 */
export function query(document: SemanticDocument, q: SemanticQuery): SemanticNode[] {
  return getInstance().query(document.root, q);
}

/**
 * Get node by ID (O(1) lookup)
 */
export function getById(document: SemanticDocument, id: SemanticId): SemanticNode | undefined {
  return document.index.get(id);
}

/**
 * Navigate to next node
 */
export function navigate(
  document: SemanticDocument,
  currentId: SemanticId,
  options: NavigationOptions
): SemanticNode | null {
  return getInstance().navigate(document, currentId, options);
}

/**
 * Get all landmarks
 */
export function getLandmarks(document: SemanticDocument): SemanticNode[] {
  return document.landmarks;
}

/**
 * Get all interactive elements
 */
export function getInteractables(document: SemanticDocument): SemanticNode[] {
  return document.interactables;
}

/**
 * Get certification info
 */
export function getCertification(document: SemanticDocument): AgentCertification {
  return document.agentReady;
}

/**
 * Check if document is agent-ready
 */
export function isAgentReady(document: SemanticDocument): boolean {
  const { level } = document.agentReady;
  return level !== 'none' && level !== 'basic';
}

/**
 * SSG State Manager for vanilla JS
 */
export class SSGStateManager {
  private state: Map<SemanticId, StateType> = new Map();
  private history: Map<SemanticId, Array<{ from: StateType; to: StateType; timestamp: number }>> =
    new Map();
  private listeners: Map<SemanticId, Set<(state: StateType) => void>> = new Map();
  private globalListeners: Set<(id: SemanticId, state: StateType) => void> = new Set();
  private document: SemanticDocument | null = null;

  /**
   * Initialize with a semantic document
   */
  init(document: SemanticDocument): void {
    this.document = document;

    // Initialize state from SSG nodes
    document.stateGraph.forEach((ssgNode, id) => {
      this.state.set(id, ssgNode.currentState);
    });
  }

  /**
   * Get current state of a node
   */
  getState(id: SemanticId): StateType {
    return this.state.get(id) || 'idle';
  }

  /**
   * Get state history for a node
   */
  getHistory(id: SemanticId): Array<{ from: StateType; to: StateType; timestamp: number }> {
    return this.history.get(id) || [];
  }

  /**
   * Set state directly
   */
  setState(id: SemanticId, newState: StateType): void {
    const currentState = this.state.get(id) || 'idle';
    if (currentState === newState) return;

    this.state.set(id, newState);

    // Update history
    const hist = this.history.get(id) || [];
    hist.push({ from: currentState, to: newState, timestamp: Date.now() });
    if (hist.length > 100) hist.shift();
    this.history.set(id, hist);

    // Notify listeners
    this.notifyListeners(id, newState);
  }

  /**
   * Trigger a state transition
   */
  transition(id: SemanticId, trigger: string): boolean {
    if (!this.document) return false;

    const ssgNode = this.document.stateGraph.get(id);
    if (!ssgNode) return false;

    const currentState = this.getState(id);
    const transition = ssgNode.transitions.find(
      (t) => t.from === currentState && t.trigger === trigger
    );

    if (transition) {
      this.setState(id, transition.to);
      return true;
    }

    return false;
  }

  /**
   * Check if a transition is possible
   */
  canTransition(id: SemanticId, trigger: string): boolean {
    if (!this.document) return false;

    const ssgNode = this.document.stateGraph.get(id);
    if (!ssgNode) return false;

    const currentState = this.getState(id);
    return ssgNode.transitions.some((t) => t.from === currentState && t.trigger === trigger);
  }

  /**
   * Get available transitions for a node
   */
  getAvailableTransitions(id: SemanticId): StateTransition[] {
    if (!this.document) return [];

    const ssgNode = this.document.stateGraph.get(id);
    if (!ssgNode) return [];

    const currentState = this.getState(id);
    return ssgNode.transitions.filter((t) => t.from === currentState);
  }

  /**
   * Subscribe to state changes for a specific node
   */
  subscribe(id: SemanticId, listener: (state: StateType) => void): () => void {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, new Set());
    }
    this.listeners.get(id)!.add(listener);

    return () => {
      this.listeners.get(id)?.delete(listener);
    };
  }

  /**
   * Subscribe to all state changes
   */
  subscribeAll(listener: (id: SemanticId, state: StateType) => void): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /**
   * Notify listeners of state change
   */
  private notifyListeners(id: SemanticId, state: StateType): void {
    this.listeners.get(id)?.forEach((l) => l(state));
    this.globalListeners.forEach((l) => l(id, state));
  }

  /**
   * Get all states as a snapshot
   */
  snapshot(): Map<SemanticId, StateType> {
    return new Map(this.state);
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.state.clear();
    this.history.clear();

    if (this.document) {
      this.init(this.document);
    }
  }
}

/**
 * Create SSG state manager
 */
export function createSSGManager(): SSGStateManager {
  return new SSGStateManager();
}

/**
 * MutationObserver wrapper for automatic re-parsing
 */
export class SemanticObserver {
  private observer: MutationObserver | null = null;
  private sdom: SemanticDOM;
  private callback: (document: SemanticDocument) => void;
  private element: Element | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs: number;

  constructor(
    callback: (document: SemanticDocument) => void,
    config?: SemanticDOMConfig,
    debounceMs = 100
  ) {
    this.sdom = createSemanticDOM(config);
    this.callback = callback;
    this.debounceMs = debounceMs;
  }

  /**
   * Start observing an element
   */
  observe(element: Element): void {
    if (typeof MutationObserver === 'undefined') {
      console.warn('MutationObserver not available');
      return;
    }

    this.element = element;
    this.parseAndNotify();

    this.observer = new MutationObserver(() => {
      this.debouncedParse();
    });

    this.observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-expanded', 'aria-selected', 'aria-checked', 'disabled', 'hidden', 'role'],
    });
  }

  /**
   * Stop observing
   */
  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.element = null;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Force re-parse
   */
  refresh(): void {
    this.parseAndNotify();
  }

  private debouncedParse(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.parseAndNotify();
    }, this.debounceMs);
  }

  private parseAndNotify(): void {
    if (!this.element) return;

    const url = typeof window !== 'undefined' ? window.location.href : '';
    const title = typeof document !== 'undefined' ? document.title : '';

    const doc = this.sdom.parse(this.element, url, title);
    this.callback(doc);
  }
}

/**
 * Create a semantic observer
 */
export function createObserver(
  callback: (document: SemanticDocument) => void,
  config?: SemanticDOMConfig,
  debounceMs?: number
): SemanticObserver {
  return new SemanticObserver(callback, config, debounceMs);
}

/**
 * Serialize semantic document to JSON
 */
export function toJSON(document: SemanticDocument): string {
  const serializable = {
    ...document,
    index: Object.fromEntries(
      Array.from(document.index.entries()).map(([k, v]) => [
        k,
        { ...v, element: undefined, children: v.children.map((c) => c.id) },
      ])
    ),
    stateGraph: Object.fromEntries(document.stateGraph.entries()),
    root: serializeNode(document.root),
  };

  return JSON.stringify(serializable, null, 2);
}

/**
 * Serialize a node for JSON output
 */
function serializeNode(node: SemanticNode): Record<string, unknown> {
  return {
    ...node,
    element: undefined,
    children: node.children.map(serializeNode),
  };
}

/**
 * Export semantic document as a plain object
 */
export function toPlainObject(document: SemanticDocument): Record<string, unknown> {
  return JSON.parse(toJSON(document)) as Record<string, unknown>;
}

/**
 * Find element by semantic ID
 */
export function findElement(document: SemanticDocument, id: SemanticId): Element | null {
  const node = getById(document, id);
  if (!node) return null;

  // Try element reference first
  if (node.element && typeof node.element === 'object') {
    return node.element;
  }

  // Fall back to selector
  if (typeof document !== 'undefined') {
    try {
      return globalThis.document.querySelector(node.selector);
    } catch {
      return null;
    }
  }

  return null;
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

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (element instanceof HTMLSelectElement) {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  return false;
}

/**
 * Export all functions and classes
 */
export {
  SemanticDOM,
  createSemanticDOM,
  type SemanticDocument,
  type SemanticNode,
  type SemanticId,
  type SemanticQuery,
  type SemanticDOMConfig,
  type NavigationOptions,
  type SSGNode,
  type StateType,
  type StateTransition,
  type AgentCertification,
};
