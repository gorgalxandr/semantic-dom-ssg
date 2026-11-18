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
import { meetsLevel } from '../core/certification.js';
import { SemanticDOM, createSemanticDOM } from '../core/semantic-dom.js';
import { queryNodes, navigateNodes } from '../core/traversal.js';

export { SSGStateManager, createSSGManager } from './state-manager.js';
export { SemanticObserver, createObserver, OBSERVED_ATTRIBUTES } from './observer.js';
export { toJSON, toPlainObject } from './serialize.js';
export { findElement, click, focus, setValue } from './actions.js';

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
  return queryNodes(document.root, q);
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
  return navigateNodes(document, currentId, options);
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
  return meetsLevel(document.agentReady.level, 'standard');
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
