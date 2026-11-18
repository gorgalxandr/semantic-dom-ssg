/**
 * MCP (Model Context Protocol) Server for SemanticDOM
 * Exposes SemanticDOM/SSG as MCP Resources and Tools
 *
 * Compatible with the Linux Foundation's Model Context Protocol standard
 * @see https://modelcontextprotocol.io/specification
 *
 * @packageDocumentation
 */

import type { SemanticDocument } from '../core/types.js';
import { VERSION } from '../core/constants.js';
import { toSerializable } from '../core/serialize.js';
import { toTOON } from '../toon/index.js';

export { executeTool } from './tools.js';
export { getPrompt } from './prompts.js';
export { createMCPServer, serveStdio, SUPPORTED_PROTOCOL_VERSIONS } from './server.js';
export type { JSONRPCMessage, JSONRPCResponse, MCPServer, MCPServerOptions } from './server.js';
export type { MCPPromptResult } from './prompts.js';

/**
 * MCP Resource descriptor for SemanticDOM
 */
export interface MCPResource {
  uri: string;
  mimeType: string;
  name: string;
  description?: string;
}

/**
 * MCP Tool descriptor
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    additionalProperties?: boolean;
    required?: string[];
  };
}

/**
 * MCP Tool call result
 */
export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'resource';
    text?: string;
    resource?: MCPResource;
  }>;
  isError?: boolean;
}

/**
 * MCP Prompt descriptor
 */
export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

/**
 * SemanticDOM MCP Server capabilities
 */
export interface SemanticDOMMCPCapabilities {
  resources: MCPResource[];
  tools: MCPTool[];
  prompts: MCPPrompt[];
}

/**
 * Build the resource URI for a document. Documents parsed without an absolute
 * URL (the default) are addressed as `semantic-dom://local/`.
 */
export function resourceUri(document: SemanticDocument): string {
  try {
    const { hostname, pathname } = new URL(document.url);
    return `semantic-dom://${hostname || 'local'}${pathname || '/'}`;
  } catch {
    return 'semantic-dom://local/';
  }
}

/**
 * Create MCP resource from SemanticDocument
 */
export function createResource(
  document: SemanticDocument,
  format: 'json' | 'toon' = 'toon'
): MCPResource {
  return {
    uri: resourceUri(document),
    mimeType: format === 'toon' ? 'text/toon' : 'application/json',
    name: document.title || 'SemanticDOM Document',
    description: `SemanticDOM structure with ${document.landmarks.length} landmarks, ${document.interactables.length} interactables. Agent certification: ${document.agentReady.level} (${document.agentReady.score}/100)`,
  };
}

/**
 * Get available MCP tools for SemanticDOM operations
 */
export function getTools(): MCPTool[] {
  return [
    {
      name: 'semantic_query',
      description: 'Query element by semantic ID with O(1) lookup time. Returns element details including role, label, state, and accessibility info.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Semantic ID of the element, as listed by semantic_list_interactables or semantic_find (e.g., "sdom-button-1k2j3h4g5f")',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'semantic_navigate',
      description: 'Navigate to a landmark region. Returns landmark details and its interactive children.',
      inputSchema: {
        type: 'object',
        properties: {
          landmark: {
            type: 'string',
            description: 'Landmark role or semantic ID (e.g., "main", "navigation")',
          },
        },
        required: ['landmark'],
      },
    },
    {
      name: 'semantic_interact',
      description: 'Get interaction details for an element. Returns intent, state, available actions, and CSS selector for automation.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Semantic ID of the interactive element',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'semantic_list_landmarks',
      description: 'List all landmark regions on the page for navigation overview.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'semantic_list_interactables',
      description: 'List all interactive elements (buttons, links, inputs) with their intents.',
      inputSchema: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            description: 'Optional filter by role (e.g., "button", "link", "textbox")',
          },
        },
      },
    },
    {
      name: 'semantic_state_graph',
      description: 'Get the Semantic State Graph showing all stateful elements and their possible state transitions.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Optional: filter to specific element ID',
          },
        },
      },
    },
    {
      name: 'semantic_find',
      description: 'Find elements by visible text, role and/or intent. Returns matching elements with their semantic IDs and selectors.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Case-insensitive text to look for in labels and accessible names' },
          role: { type: 'string', description: 'Restrict to a role (e.g., "button", "link", "textbox")' },
          intent: { type: 'string', description: 'Restrict to an intent (e.g., "submit", "navigate", "search")' },
          limit: { type: 'number', description: 'Maximum results (default 20, maximum 100)' },
        },
      },
    },
    {
      name: 'semantic_summary',
      description: 'Get a compact plain-text overview of the page: certification, landmarks and available actions.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'semantic_certification',
      description: 'Get agent certification status including level, score, and any failed checks.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];
}

/**
 * Get available MCP prompts for SemanticDOM
 */
export function getPrompts(): MCPPrompt[] {
  return [
    {
      name: 'analyze_page',
      description: 'Analyze page structure and provide navigation guidance',
      arguments: [
        {
          name: 'goal',
          description: 'What the user wants to accomplish on this page',
          required: true,
        },
      ],
    },
    {
      name: 'find_element',
      description: 'Find the best element to interact with for a given task',
      arguments: [
        {
          name: 'task',
          description: 'Description of what you want to do (e.g., "submit the form", "navigate to settings")',
          required: true,
        },
      ],
    },
    {
      name: 'automation_plan',
      description: 'Generate a step-by-step automation plan using semantic IDs',
      arguments: [
        {
          name: 'workflow',
          description: 'Description of the workflow to automate',
          required: true,
        },
      ],
    },
  ];
}

/**
 * Get full MCP capabilities for SemanticDOM
 */
export function getCapabilities(document: SemanticDocument): SemanticDOMMCPCapabilities {
  return {
    resources: [createResource(document, 'toon')],
    tools: getTools(),
    prompts: getPrompts(),
  };
}

/**
 * Serialize document for MCP resource response
 */
export function serializeForMCP(
  document: SemanticDocument,
  format: 'json' | 'toon' = 'toon'
): string {
  if (format === 'toon') {
    return toTOON(document);
  }
  const { root: _root, stateGraph: _stateGraph, ...overview } = toSerializable(document, {
    includeStateGraph: false,
  });
  return JSON.stringify(overview, null, 2);
}

/**
 * MCP Server Info for SemanticDOM
 */
export const SERVER_INFO = {
  name: 'semantic-dom-ssg',
  version: VERSION,
  protocolVersion: '2025-06-18',
  capabilities: {
    resources: { subscribe: false, listChanged: false },
    tools: {},
    prompts: { listChanged: false },
  },
};
