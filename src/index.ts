/**
 * semantic-dom-ssg
 * NPM package implementing ISO/IEC draft standard for SemanticDOM and Semantic State Graph
 *
 * @packageDocumentation
 */

// Core exports
export * from './core/index.js';

// Re-export convenience functions
export {
  SemanticDOM,
  createSemanticDOM,
  parseElement,
  generateSemanticId,
} from './core/semantic-dom.js';

// TOON serialization exports
export {
  toTOON,
  fromTOON,
  treeToTOON,
  landmarksToTOON,
  interactablesToTOON,
  stateGraphToTOON,
  certificationToTOON,
  estimateTokenSavings,
} from './toon/index.js';

// MCP (Model Context Protocol) exports
export {
  createResource,
  getTools,
  getPrompts,
  executeTool,
  getCapabilities,
  serializeForMCP,
  SERVER_INFO,
} from './mcp/index.js';

export type {
  MCPResource,
  MCPTool,
  MCPToolResult,
  MCPPrompt,
  SemanticDOMMCPCapabilities,
} from './mcp/index.js';

// Version
export const VERSION = '0.1.0';

// Standard reference
export const STANDARD = 'ISO/IEC-SDOM-SSG-DRAFT-2024';
