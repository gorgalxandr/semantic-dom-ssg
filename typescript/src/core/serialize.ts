/**
 * Plain-data serialization of semantic documents.
 * DOM element references are never included, so the result is always
 * JSON-safe regardless of what a framework has attached to the elements.
 */

import type { SemanticDocument, SemanticNode, SSGNode } from './types.js';

/** A SemanticNode without its DOM reference */
export type SerializedNode = Omit<SemanticNode, 'element' | 'children'> & {
  children: SerializedNode[];
};

/** A node reference used in the landmark and interactable lists */
export interface SerializedNodeRef {
  id: string;
  role: string;
  label: string;
  intent?: string;
  state: string;
  selector: string;
}

/** A SemanticDocument as plain JSON-compatible data */
export interface SerializedDocument {
  version: string;
  standard: string;
  url: string;
  title: string;
  language: string;
  generatedAt: number;
  truncated?: boolean;
  agentReady: SemanticDocument['agentReady'];
  root: SerializedNode;
  landmarks: SerializedNodeRef[];
  interactables: SerializedNodeRef[];
  stateGraph: Record<string, SSGNode>;
}

/** Serialize a node and its subtree, dropping DOM references */
export function serializeNode(node: SemanticNode): SerializedNode {
  const { element: _element, children, ...rest } = node;
  return { ...rest, children: children.map(serializeNode) };
}

function nodeRef(node: SemanticNode): SerializedNodeRef {
  return {
    id: node.id,
    role: node.role,
    label: node.label,
    intent: node.intent,
    state: node.state,
    selector: node.selector,
  };
}

/** Convert a document to plain data */
export function toSerializable(
  document: SemanticDocument,
  options: { includeStateGraph?: boolean } = {}
): SerializedDocument {
  return {
    version: document.version,
    standard: document.standard,
    url: document.url,
    title: document.title,
    language: document.language,
    generatedAt: document.generatedAt,
    ...(document.truncated ? { truncated: true } : {}),
    agentReady: document.agentReady,
    root: serializeNode(document.root),
    landmarks: document.landmarks.map(nodeRef),
    interactables: document.interactables.map(nodeRef),
    stateGraph:
      options.includeStateGraph === false ? {} : Object.fromEntries(document.stateGraph),
  };
}
