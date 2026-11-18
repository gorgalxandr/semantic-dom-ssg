/**
 * External store backing the useSSG hook
 */

import type { SemanticId, StateTransition, StateType } from '../core/types.js';

/** One recorded state change */
export interface StateChange {
  from: StateType;
  to: StateType;
  timestamp: number;
}

const MAX_HISTORY = 100;
const EMPTY_HISTORY: StateChange[] = [];

/**
 * Store for SSG state management
 */
export class SSGStore {
  private state: Map<SemanticId, StateType> = new Map();
  private history: Map<SemanticId, StateChange[]> = new Map();
  private listeners: Set<() => void> = new Set();

  getState(id: SemanticId): StateType | undefined {
    return this.state.get(id);
  }

  getHistory(id: SemanticId): StateChange[] {
    return this.history.get(id) ?? EMPTY_HISTORY;
  }

  /** Seed a node's state without recording a transition or notifying */
  initialize(id: SemanticId, state: StateType): void {
    if (!this.state.has(id)) this.state.set(id, state);
  }

  /** Forget everything; intended for tests and full page resets */
  clear(): void {
    this.state.clear();
    this.history.clear();
    this.emit();
  }

  setState(id: SemanticId, newState: StateType): void {
    const currentState = this.state.get(id) || 'idle';
    if (currentState === newState) return;

    this.state.set(id, newState);

    // Update history
    // A new array each time, so React sees history change by identity.
    const previous = this.history.get(id) ?? EMPTY_HISTORY;
    const next = [...previous, { from: currentState, to: newState, timestamp: Date.now() }];
    this.history.set(id, next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next);

    this.emit();
  }

  transition(id: SemanticId, trigger: string, transitions: StateTransition[]): boolean {
    const currentState = this.state.get(id) || 'idle';
    const transition = transitions.find(
      (t) => t.from === currentState && t.trigger === trigger
    );

    if (transition) {
      this.setState(id, transition.to);
      return true;
    }
    return false;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }

  getSnapshot(): Map<SemanticId, StateType> {
    return new Map(this.state);
  }
}

/** Store shared by every useSSG hook on the page */
export const globalSSGStore = new SSGStore();

