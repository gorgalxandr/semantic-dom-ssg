/**
 * semantic-dom-ssg
 * Machine-readable web semantics for AI agents: SemanticDOM and Semantic State Graph
 *
 * @packageDocumentation
 */

// Core: types, parser, constants (VERSION, STANDARD), security and serialization helpers
export * from './core/index.js';

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
  resourceUri,
  getTools,
  getPrompts,
  getPrompt,
  executeTool,
  getCapabilities,
  serializeForMCP,
  createMCPServer,
  SERVER_INFO,
  SUPPORTED_PROTOCOL_VERSIONS,
} from './mcp/index.js';

export type {
  MCPResource,
  MCPTool,
  MCPToolResult,
  MCPPrompt,
  MCPPromptResult,
  MCPServer,
  MCPServerOptions,
  SemanticDOMMCPCapabilities,
} from './mcp/index.js';

// Agent Summary exports (ultra token-efficient format)
export {
  toAgentSummary,
  toOneLiner,
  toNavSummary,
  toAudioSummary,
  estimateSummaryTokens,
  compareTokenUsage,
} from './summary/index.js';

export type { AgentSummaryOptions } from './summary/index.js';
