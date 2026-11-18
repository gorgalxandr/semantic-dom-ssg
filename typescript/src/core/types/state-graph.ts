import type { SemanticId, SemanticIntent, StateType } from './vocabulary.js';

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
  // `string & {}` keeps editor completion for known intents while allowing custom triggers.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  trigger: SemanticIntent | (string & {});

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
