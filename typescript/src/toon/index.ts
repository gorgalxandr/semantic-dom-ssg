/**
 * TOON Serialization for SemanticDOM
 * Token-Oriented Object Notation for LLM-efficient semantic document encoding
 *
 * TOON reduces token usage by ~40-50% compared to JSON, making it ideal
 * for passing SemanticDOM documents to AI agents.
 *
 * @packageDocumentation
 */

import { encode, decode, type EncodeOptions, type DecodeOptions } from '@toon-format/toon';
import type {
  SemanticDocument,
  SemanticNode,
  SemanticId,
  SSGNode,
  AgentCertification,
} from '../core/types.js';

/**
 * Serializable representation of SemanticNode (without circular refs)
 */
interface SerializableNode {
  id: string;
  role: string;
  label: string;
  intent?: string;
  state: string;
  selector: string;
  xpath: string;
  a11y: {
    name: string;
    focusable: boolean;
    inTabOrder: boolean;
    level?: number;
  };
  children: SerializableNode[];
  value?: string | number | boolean;
}

/**
 * Serializable document format for TOON encoding
 */
interface SerializableDocument {
  version: string;
  standard: string;
  url: string;
  title: string;
  language: string;
  generatedAt: number;
  agentReady: {
    level: string;
    score: number;
    checks: Array<{ id: string; name: string; passed: boolean }>;
    failures: Array<{ id: string; name: string; message: string; severity?: string }>;
  };
  root: SerializableNode;
  landmarks: Array<{ id: string; role: string; label: string }>;
  interactables: Array<{ id: string; role: string; label: string; intent?: string }>;
  stateGraph: Array<{
    id: string;
    state: string;
    transitions: Array<{ from: string; to: string; trigger: string }>;
  }>;
}

/**
 * Convert SemanticNode to serializable format
 */
function serializeNode(node: SemanticNode): SerializableNode {
  return {
    id: node.id,
    role: node.role,
    label: node.label,
    intent: node.intent,
    state: node.state,
    selector: node.selector,
    xpath: node.xpath,
    a11y: {
      name: node.a11y.name,
      focusable: node.a11y.focusable,
      inTabOrder: node.a11y.inTabOrder,
      level: node.a11y.level,
    },
    children: node.children.map(serializeNode),
    value: node.value,
  };
}

/**
 * Convert SemanticDocument to serializable format
 */
function serializeDocument(doc: SemanticDocument): SerializableDocument {
  const stateGraphArray: SerializableDocument['stateGraph'] = [];

  doc.stateGraph.forEach((ssgNode, id) => {
    stateGraphArray.push({
      id,
      state: ssgNode.currentState,
      transitions: ssgNode.transitions.map((t) => ({
        from: t.from,
        to: t.to,
        trigger: typeof t.trigger === 'string' ? t.trigger : String(t.trigger),
      })),
    });
  });

  return {
    version: doc.version,
    standard: doc.standard,
    url: doc.url,
    title: doc.title,
    language: doc.language,
    generatedAt: doc.generatedAt,
    agentReady: {
      level: doc.agentReady.level,
      score: doc.agentReady.score,
      checks: doc.agentReady.checks.map((c) => ({
        id: c.id,
        name: c.name,
        passed: c.passed,
      })),
      failures: doc.agentReady.failures.map((f) => ({
        id: f.id,
        name: f.name,
        message: f.message,
        severity: f.severity,
      })),
    },
    root: serializeNode(doc.root),
    landmarks: doc.landmarks.map((l) => ({
      id: l.id,
      role: l.role,
      label: l.label,
    })),
    interactables: doc.interactables.map((i) => ({
      id: i.id,
      role: i.role,
      label: i.label,
      intent: i.intent,
    })),
    stateGraph: stateGraphArray,
  };
}

/**
 * Encode SemanticDocument to TOON format
 *
 * @param document - SemanticDocument to encode
 * @param options - TOON encoding options
 * @returns TOON formatted string
 *
 * @example
 * ```ts
 * const toon = toTOON(document);
 * // Saves ~40-50% tokens vs JSON
 * ```
 */
export function toTOON(document: SemanticDocument, options?: EncodeOptions): string {
  const serializable = serializeDocument(document);
  return encode(serializable, {
    indent: 2,
    keyFolding: 'safe',
    ...options,
  });
}

/**
 * Decode TOON string to partial SemanticDocument data
 *
 * Note: Returns plain object structure, not full SemanticDocument with Map indexes.
 * Use this for reading TOON data; create fresh SemanticDocument via parse() for full functionality.
 *
 * @param toon - TOON formatted string
 * @param options - TOON decoding options
 * @returns Decoded document data
 */
export function fromTOON(toon: string, options?: DecodeOptions): SerializableDocument {
  return decode(toon, {
    strict: true,
    expandPaths: 'safe',
    ...options,
  }) as unknown as SerializableDocument;
}

/**
 * Encode just the semantic tree (nodes only) to TOON
 * Useful for passing to LLMs when you only need structure
 *
 * @param root - Root SemanticNode
 * @returns TOON formatted string of just the tree
 */
export function treeToTOON(root: SemanticNode, options?: EncodeOptions): string {
  return encode(serializeNode(root), {
    indent: 2,
    keyFolding: 'safe',
    ...options,
  });
}

/**
 * Encode landmarks array to TOON (compact format)
 *
 * @param landmarks - Array of landmark nodes
 * @returns TOON formatted string
 */
export function landmarksToTOON(landmarks: SemanticNode[], options?: EncodeOptions): string {
  const data = landmarks.map((l) => ({
    id: l.id,
    role: l.role,
    label: l.label,
    selector: l.selector,
  }));
  return encode({ landmarks: data }, options);
}

/**
 * Encode interactables array to TOON (compact format)
 *
 * @param interactables - Array of interactive nodes
 * @returns TOON formatted string
 */
export function interactablesToTOON(interactables: SemanticNode[], options?: EncodeOptions): string {
  const data = interactables.map((i) => ({
    id: i.id,
    role: i.role,
    label: i.label,
    intent: i.intent,
    state: i.state,
    selector: i.selector,
  }));
  return encode({ interactables: data }, options);
}

/**
 * Encode state graph to TOON
 *
 * @param stateGraph - Map of SSG nodes
 * @returns TOON formatted string
 */
export function stateGraphToTOON(
  stateGraph: Map<SemanticId, SSGNode>,
  options?: EncodeOptions
): string {
  const nodes: Array<{
    id: string;
    state: string;
    transitions: Array<{ from: string; to: string; trigger: string }>;
  }> = [];

  stateGraph.forEach((node, id) => {
    nodes.push({
      id,
      state: node.currentState,
      transitions: node.transitions.map((t) => ({
        from: t.from,
        to: t.to,
        trigger: String(t.trigger),
      })),
    });
  });

  return encode({ stateGraph: nodes }, options);
}

/**
 * Encode certification report to TOON
 *
 * @param certification - AgentCertification object
 * @returns TOON formatted string
 */
export function certificationToTOON(
  certification: AgentCertification,
  options?: EncodeOptions
): string {
  return encode(
    {
      level: certification.level,
      score: certification.score,
      passed: certification.checks.map((c) => c.name),
      failed: certification.failures.map((f) => ({
        name: f.name,
        severity: f.severity,
        message: f.message,
      })),
    },
    options
  );
}

/**
 * Calculate token savings estimate
 *
 * @param document - SemanticDocument to analyze
 * @returns Token comparison stats
 */
export function estimateTokenSavings(document: SemanticDocument): {
  jsonTokens: number;
  toonTokens: number;
  savings: number;
  savingsPercent: number;
} {
  const serializable = serializeDocument(document);
  const jsonStr = JSON.stringify(serializable, null, 2);
  const toonStr = toTOON(document);

  // Rough token estimate: ~4 chars per token for English text
  const jsonTokens = Math.ceil(jsonStr.length / 4);
  const toonTokens = Math.ceil(toonStr.length / 4);
  const savings = jsonTokens - toonTokens;
  const savingsPercent = Math.round((savings / jsonTokens) * 100);

  return {
    jsonTokens,
    toonTokens,
    savings,
    savingsPercent,
  };
}

// Re-export TOON types for convenience
export type { EncodeOptions, DecodeOptions } from '@toon-format/toon';
