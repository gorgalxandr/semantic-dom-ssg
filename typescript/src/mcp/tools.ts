/**
 * MCP tool execution against a SemanticDocument.
 * Arguments arrive from a model and are validated before use.
 */

import type { SemanticDocument, SemanticId, SemanticNode } from '../core/types.js';
import { queryNodes } from '../core/traversal.js';
import { toAgentSummary } from '../summary/index.js';
import {
  interactablesToTOON,
  landmarksToTOON,
  stateGraphToTOON,
  treeToTOON,
} from '../toon/index.js';
import type { MCPToolResult } from './index.js';

const MAX_ARG_LENGTH = 512;
const DEFAULT_FIND_LIMIT = 20;
const MAX_FIND_LIMIT = 100;

function text(value: string): MCPToolResult {
  return { content: [{ type: 'text', text: value }] };
}

function error(message: string): MCPToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Echo a caller-supplied value back in a message without trusting its content */
function quote(value: string): string {
  return JSON.stringify(value.slice(0, 80));
}

type Arg = { ok: true; value: string | undefined } | { ok: false; result: MCPToolResult };

function stringArg(args: Record<string, unknown>, name: string, required: boolean): Arg {
  const value = args[name];
  if (value === undefined || value === null || value === '') {
    return required
      ? { ok: false, result: error(`Missing required argument: ${name}`) }
      : { ok: true, value: undefined };
  }
  if (typeof value !== 'string') {
    return { ok: false, result: error(`Argument "${name}" must be a string`) };
  }
  if (value.length > MAX_ARG_LENGTH) {
    return { ok: false, result: error(`Argument "${name}" is too long`) };
  }
  return { ok: true, value };
}

function interactionDetails(document: SemanticDocument, node: SemanticNode): string {
  const ssgNode = document.stateGraph.get(node.id);
  return JSON.stringify(
    {
      id: node.id,
      role: node.role,
      label: node.label,
      intent: node.intent,
      state: node.state,
      value: node.value,
      selector: node.selector,
      xpath: node.xpath,
      a11y: node.a11y,
      stateGraph: ssgNode
        ? { currentState: ssgNode.currentState, transitions: ssgNode.transitions }
        : null,
    },
    null,
    2
  );
}

function find(document: SemanticDocument, args: Record<string, unknown>): MCPToolResult {
  const query: Record<string, string> = {};
  for (const name of ['text', 'role', 'intent'] as const) {
    const arg = stringArg(args, name, false);
    if (!arg.ok) return arg.result;
    if (arg.value) query[name] = name === 'text' ? arg.value : arg.value.toLowerCase();
  }
  if (Object.keys(query).length === 0) {
    return error('Provide at least one of: text, role, intent');
  }

  const requested = typeof args.limit === 'number' ? Math.floor(args.limit) : DEFAULT_FIND_LIMIT;
  const limit = Math.min(MAX_FIND_LIMIT, Math.max(1, requested || DEFAULT_FIND_LIMIT));

  const matches = queryNodes(document.root, { ...query, limit });
  return text(interactablesToTOON(matches));
}

/**
 * Execute MCP tool call
 */
export function executeTool(
  document: SemanticDocument,
  toolName: string,
  args: Record<string, unknown> | undefined | null
): MCPToolResult {
  const input: Record<string, unknown> =
    args && typeof args === 'object' && !Array.isArray(args) ? args : {};

  switch (toolName) {
    case 'semantic_query':
    case 'semantic_interact': {
      const id = stringArg(input, 'id', true);
      if (!id.ok) return id.result;
      const node = document.index.get(id.value as SemanticId);
      if (!node) return error(`Element not found: ${quote(id.value as string)}`);
      return text(toolName === 'semantic_query' ? treeToTOON(node) : interactionDetails(document, node));
    }

    case 'semantic_navigate': {
      const landmark = stringArg(input, 'landmark', true);
      if (!landmark.ok) return landmark.result;
      const wanted = landmark.value as string;
      const found = document.landmarks.find((l) => l.role === wanted || l.id === wanted);
      if (!found) return error(`Landmark not found: ${quote(wanted)}`);
      return text(treeToTOON(found));
    }

    case 'semantic_list_landmarks':
      return text(landmarksToTOON(document.landmarks));

    case 'semantic_list_interactables': {
      const filter = stringArg(input, 'filter', false);
      if (!filter.ok) return filter.result;
      const role = filter.value?.toLowerCase();
      const items = role
        ? document.interactables.filter((i) => i.role === role)
        : document.interactables;
      return text(interactablesToTOON(items));
    }

    case 'semantic_find':
      return find(document, input);

    case 'semantic_summary':
      return text(toAgentSummary(document));

    case 'semantic_state_graph': {
      const id = stringArg(input, 'id', false);
      if (!id.ok) return id.result;
      if (!id.value) return text(stateGraphToTOON(document.stateGraph));

      const node = document.stateGraph.get(id.value as SemanticId);
      if (!node) return error(`State graph node not found: ${quote(id.value)}`);
      return text(
        JSON.stringify(
          { id: id.value, currentState: node.currentState, transitions: node.transitions },
          null,
          2
        )
      );
    }

    case 'semantic_certification':
      return text(JSON.stringify(document.agentReady, null, 2));

    default:
      return error(`Unknown tool: ${quote(String(toolName))}`);
  }
}
