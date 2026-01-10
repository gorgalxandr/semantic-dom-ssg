/**
 * MCP (Model Context Protocol) Server for SemanticDOM
 * Exposes SemanticDOM/SSG as MCP Resources and Tools
 *
 * Compatible with the Linux Foundation's Model Context Protocol standard
 * @see https://modelcontextprotocol.io/specification
 *
 * @packageDocumentation
 */

import type {
  SemanticDocument,
  SemanticId,
} from '../core/types.js';
import { toTOON, treeToTOON, landmarksToTOON, interactablesToTOON, stateGraphToTOON } from '../toon/index.js';

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
    properties: Record<string, { type: string; description: string }>;
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
 * Create MCP resource from SemanticDocument
 */
export function createResource(
  document: SemanticDocument,
  format: 'json' | 'toon' = 'toon'
): MCPResource {
  return {
    uri: `semantic-dom://${new URL(document.url).hostname}${new URL(document.url).pathname}`,
    mimeType: format === 'toon' ? 'application/toon' : 'application/json',
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
            description: 'Semantic ID of the element (e.g., "nav-main", "btn-submit")',
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
            description: 'Landmark role or ID (e.g., "main", "navigation", "nav-primary")',
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
 * Execute MCP tool call
 */
export function executeTool(
  document: SemanticDocument,
  toolName: string,
  args: Record<string, unknown>
): MCPToolResult {
  switch (toolName) {
    case 'semantic_query': {
      const id = args.id as string;
      const node = document.index.get(id as SemanticId);
      if (!node) {
        return {
          content: [{ type: 'text', text: `Element not found: ${id}` }],
          isError: true,
        };
      }
      return {
        content: [{
          type: 'text',
          text: treeToTOON(node),
        }],
      };
    }

    case 'semantic_navigate': {
      const landmark = args.landmark as string;
      const found = document.landmarks.find(
        (l) => l.role === landmark || l.id === landmark
      );
      if (!found) {
        return {
          content: [{ type: 'text', text: `Landmark not found: ${landmark}` }],
          isError: true,
        };
      }
      return {
        content: [{
          type: 'text',
          text: treeToTOON(found),
        }],
      };
    }

    case 'semantic_interact': {
      const id = args.id as string;
      const node = document.index.get(id as SemanticId);
      if (!node) {
        return {
          content: [{ type: 'text', text: `Element not found: ${id}` }],
          isError: true,
        };
      }
      const ssgNode = document.stateGraph.get(id as SemanticId);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            id: node.id,
            role: node.role,
            label: node.label,
            intent: node.intent,
            state: node.state,
            selector: node.selector,
            xpath: node.xpath,
            a11y: node.a11y,
            stateGraph: ssgNode ? {
              currentState: ssgNode.currentState,
              transitions: ssgNode.transitions,
            } : null,
          }, null, 2),
        }],
      };
    }

    case 'semantic_list_landmarks': {
      return {
        content: [{
          type: 'text',
          text: landmarksToTOON(document.landmarks),
        }],
      };
    }

    case 'semantic_list_interactables': {
      const filter = args.filter as string | undefined;
      let interactables = document.interactables;
      if (filter) {
        interactables = interactables.filter((i) => i.role === filter);
      }
      return {
        content: [{
          type: 'text',
          text: interactablesToTOON(interactables),
        }],
      };
    }

    case 'semantic_state_graph': {
      const id = args.id as SemanticId | undefined;
      if (id) {
        const node = document.stateGraph.get(id);
        if (!node) {
          return {
            content: [{ type: 'text', text: `State graph node not found: ${id}` }],
            isError: true,
          };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              id,
              currentState: node.currentState,
              transitions: node.transitions,
            }, null, 2),
          }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: stateGraphToTOON(document.stateGraph),
        }],
      };
    }

    case 'semantic_certification': {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(document.agentReady, null, 2),
        }],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
  }
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
  return JSON.stringify({
    version: document.version,
    standard: document.standard,
    url: document.url,
    title: document.title,
    agentReady: document.agentReady,
    landmarks: document.landmarks.map((l) => ({ id: l.id, role: l.role, label: l.label })),
    interactables: document.interactables.map((i) => ({
      id: i.id,
      role: i.role,
      label: i.label,
      intent: i.intent,
    })),
  }, null, 2);
}

/**
 * MCP Server Info for SemanticDOM
 */
export const SERVER_INFO = {
  name: 'semantic-dom-ssg',
  version: '0.1.0',
  protocolVersion: '2024-11-05',
  capabilities: {
    resources: { subscribe: false, listChanged: true },
    tools: {},
    prompts: { listChanged: false },
  },
};
