/**
 * Semantic State Graph state manager (framework-agnostic)
 */

import type { SemanticDocument, SemanticId, StateTransition, StateType } from '../core/types.js';

function safely(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    console.error('SemanticDOM: state listener threw', error);
  }
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
    this.state.clear();
    this.history.clear();

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
    return [...(this.history.get(id) || [])];
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
    const existing = this.listeners.get(id) ?? new Set();
    existing.add(listener);
    this.listeners.set(id, existing);

    return () => {
      const set = this.listeners.get(id);
      set?.delete(listener);
      if (set?.size === 0) this.listeners.delete(id);
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
    // Copy before iterating so listeners may unsubscribe while being notified,
    // and isolate failures so one bad listener cannot block the others.
    for (const listener of [...(this.listeners.get(id) ?? [])]) {
      safely(() => listener(state));
    }
    for (const listener of [...this.globalListeners]) {
      safely(() => listener(id, state));
    }
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

