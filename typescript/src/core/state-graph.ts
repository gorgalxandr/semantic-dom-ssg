/**
 * Semantic State Graph construction
 */

import type { SemanticNode, SSGNode, StateTransition, StateType } from './types.js';

const MAX_HISTORY = 100;

function toggleable(a: StateType, b: StateType, trigger: string): StateTransition[] {
  return [
    { from: a, to: b, trigger },
    { from: b, to: a, trigger },
  ];
}

/**
 * Infer state transitions from role and current state.
 * Each (from, trigger) pair appears at most once, so the graph is a
 * deterministic finite state machine.
 */
export function inferTransitions(node: SemanticNode): StateTransition[] {
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
    case 'switch':
      transitions.push(
        ...toggleable('unchecked', 'checked', 'toggle'),
        { from: 'indeterminate', to: 'checked', trigger: 'toggle' }
      );
      break;

    case 'textbox':
    case 'searchbox':
    case 'spinbutton':
    case 'combobox':
      transitions.push(
        { from: 'idle', to: 'focused', trigger: 'focus' },
        { from: 'focused', to: 'valid', trigger: 'valid' },
        { from: 'focused', to: 'invalid', trigger: 'invalid' },
        { from: 'focused', to: 'idle', trigger: 'blur' },
        { from: 'valid', to: 'idle', trigger: 'blur' },
        { from: 'invalid', to: 'focused', trigger: 'focus' },
        { from: 'invalid', to: 'idle', trigger: 'blur' }
      );
      break;

    case 'audio':
    case 'video':
      transitions.push(
        { from: 'idle', to: 'loading', trigger: 'play' },
        { from: 'loading', to: 'idle', trigger: 'pause' },
        { from: 'loading', to: 'error', trigger: 'fail' },
        { from: 'error', to: 'idle', trigger: 'reset' }
      );
      break;

    default:
      transitions.push(
        { from: 'idle', to: 'focused', trigger: 'focus' },
        { from: 'focused', to: 'idle', trigger: 'blur' }
      );
  }

  if (node.state === 'expanded' || node.state === 'collapsed') {
    transitions.push(...toggleable('collapsed', 'expanded', 'toggle'));
  }
  if (node.state === 'selected') {
    transitions.push(...toggleable('selected', 'idle', 'select'));
  } else if (node.role === 'option' || node.role === 'tab' || node.role === 'treeitem') {
    transitions.push(...toggleable('idle', 'selected', 'select'));
  }

  return dedupe(transitions);
}

/** Drop transitions that would make a (from, trigger) pair ambiguous */
function dedupe(transitions: StateTransition[]): StateTransition[] {
  const seen = new Set<string>();
  return transitions.filter((t) => {
    const key = `${t.from}|${String(t.trigger)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** True when no state has two transitions for the same trigger */
export function isDeterministic(transitions: readonly StateTransition[]): boolean {
  const seen = new Set<string>();
  for (const t of transitions) {
    const key = `${t.from}|${String(t.trigger)}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/** Create the state graph node for a semantic node */
export function createSSGNode(node: SemanticNode): SSGNode {
  return {
    semanticId: node.id,
    currentState: node.state,
    transitions: inferTransitions(node),
    history: [],
    maxHistory: MAX_HISTORY,
    relations: [],
  };
}
