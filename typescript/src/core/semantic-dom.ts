/**
 * SemanticDOM Core Implementation
 * Provides O(1) lookup and deterministic navigation
 */

import type {
  NavigationOptions,
  SemanticBounds,
  SemanticDocument,
  SemanticDOMConfig,
  SemanticId,
  SemanticNode,
  SemanticQuery,
  SSGNode,
} from './types.js';
import { extractA11y } from './a11y.js';
import { certify, emptyCertification } from './certification.js';
import { DOCUMENT_VERSION, LANDMARK_ROLES, STANDARD } from './constants.js';
import { matchesAny, ParseContext, resolveConfig, type ResolvedConfig } from './context.js';
import {
  determineIntent,
  determineState,
  extractMetadata,
  extractStateFlags,
  extractValue,
} from './extract.js';
import { namedSemanticId, stableSemanticId } from './ids.js';
import { determineRole, isInteractiveRole } from './roles.js';
import { sanitizeUrl } from './security.js';
import { childPaths, rootPath, type ElementPath } from './selectors.js';
import { createSSGNode } from './state-graph.js';
import { flattenTree, navigateNodes, queryNodes } from './traversal.js';

export { generateSemanticId, stableSemanticId } from './ids.js';

/** Mutable state of one parse() call; never shared between documents */
interface ParseRun {
  ctx: ParseContext;
  index: Map<SemanticId, SemanticNode>;
  stateGraph: Map<SemanticId, SSGNode>;
  truncated: boolean;
  keepElements: boolean;
}

function computeBounds(element: Element): SemanticBounds | undefined {
  if (typeof element.getBoundingClientRect !== 'function') return undefined;
  try {
    const { x, y, width, height, top, right, bottom, left } = element.getBoundingClientRect();
    return { x, y, width, height, top, right, bottom, left };
  } catch {
    return undefined;
  }
}

/**
 * SemanticDOM class for parsing and navigating semantic documents.
 *
 * An instance holds only configuration, so one instance can parse any number
 * of roots and every returned document owns its own index and state graph.
 */
export class SemanticDOM {
  private readonly config: ResolvedConfig;

  constructor(config: SemanticDOMConfig = {}) {
    this.config = resolveConfig(config);
  }

  /**
   * Parse a DOM element into a SemanticDocument
   */
  parse(root: Element, url = '', title = ''): SemanticDocument {
    if (!root || root.nodeType !== 1 || typeof root.tagName !== 'string') {
      throw new TypeError('SemanticDOM.parse expects a DOM Element');
    }

    const ctx = new ParseContext(this.config, root);
    const run: ParseRun = {
      ctx,
      index: new Map(),
      stateGraph: new Map(),
      truncated: false,
      keepElements: typeof window !== 'undefined',
    };

    const semanticRoot = this.parseElement(root, rootPath(root, ctx), 0, undefined, run);
    const all = flattenTree(semanticRoot);
    const doc = root.ownerDocument;

    return {
      version: DOCUMENT_VERSION,
      standard: STANDARD,
      url: sanitizeUrl(url),
      title: ctx.text(title || doc?.title),
      root: semanticRoot,
      index: run.index,
      stateGraph: run.stateGraph,
      landmarks: all.filter((n) => LANDMARK_ROLES.includes(n.role)),
      interactables: all.filter((n) => isInteractiveRole(n.role)),
      language: ctx.text(doc?.documentElement?.getAttribute('lang')) || 'en',
      generatedAt: Date.now(),
      agentReady: this.config.validate
        ? certify(all, run.stateGraph, {
            includeStateGraph: this.config.includeStateGraph,
            target: this.config.targetCertification,
          })
        : emptyCertification(),
      ...(run.truncated ? { truncated: true } : {}),
    };
  }

  /** True when an element and its subtree should be left out */
  private isExcluded(element: Element): boolean {
    return (
      matchesAny(element, this.config.exclude) && !matchesAny(element, this.config.include)
    );
  }

  /** Pick a unique ID: author-supplied name first, structural hash otherwise */
  private assignId(element: Element, node: Pick<SemanticNode, 'role' | 'xpath'>, run: ParseRun): SemanticId {
    const { idPrefix, generateIds } = this.config;
    const explicit = element.getAttribute('data-semantic-id');
    const own = generateIds ? null : element.getAttribute('id');

    const base =
      (explicit && namedSemanticId(idPrefix, explicit)) ||
      (own && namedSemanticId(idPrefix, own)) ||
      stableSemanticId(idPrefix, node.role, this.structuralKey(element, node.xpath, run));

    let id = base;
    for (let n = 2; run.index.has(id); n++) {
      id = `${base}-${n}` as SemanticId;
    }
    return id;
  }

  /** Key that identifies an element across parses: its unique id or its path */
  private structuralKey(element: Element, xpath: string, run: ParseRun): string {
    const id = element.getAttribute('id');
    return id && run.ctx.isUniqueId(id) ? `#${id}` : xpath;
  }

  /**
   * Parse a single element into a SemanticNode
   */
  private parseElement(
    element: Element,
    path: ElementPath,
    depth: number,
    parentId: SemanticId | undefined,
    run: ParseRun
  ): SemanticNode {
    const { ctx } = run;
    const role = determineRole(element, this.config);
    const a11y = extractA11y(element, role, ctx);
    const id = this.assignId(element, { role, xpath: path.xpath }, run);

    const node: SemanticNode = {
      id,
      role,
      label: a11y.name || element.getAttribute('role')?.trim().toLowerCase().split(/\s+/)[0] ||
        element.tagName.toLowerCase(),
      intent: determineIntent(element, role, a11y.name, ctx),
      state: determineState(element, role),
      stateFlags: extractStateFlags(element),
      value: extractValue(element, ctx),
      element: run.keepElements ? element : undefined,
      selector: path.selector,
      xpath: path.xpath,
      bounds: this.config.computeBounds && run.keepElements ? computeBounds(element) : undefined,
      children: [],
      parent: parentId,
      a11y,
      metadata: extractMetadata(element, ctx),
      updatedAt: Date.now(),
    };
    node.label = ctx.text(node.label);

    // Index the node for O(1) lookup
    run.index.set(id, node);

    if (this.config.includeStateGraph && isInteractiveRole(role)) {
      run.stateGraph.set(id, createSSGNode(node));
    }

    if (element.children.length === 0) return node;

    if (depth >= this.config.maxDepth) {
      run.truncated = true;
      return node;
    }

    const paths = childPaths(element, path, ctx);
    for (const child of Array.from(element.children)) {
      if (this.isExcluded(child)) continue;
      if (run.index.size >= this.config.maxNodes) {
        run.truncated = true;
        break;
      }
      const childPath = paths.get(child) as ElementPath;
      node.children.push(this.parseElement(child, childPath, depth + 1, id, run));
    }

    return node;
  }

  /**
   * Query semantic nodes
   */
  query(root: SemanticNode, query: SemanticQuery): SemanticNode[] {
    return queryNodes(root, query);
  }

  /**
   * Navigate to next semantic node
   */
  navigate(
    document: SemanticDocument,
    currentId: SemanticId,
    options: NavigationOptions
  ): SemanticNode | null {
    return navigateNodes(document, currentId, options);
  }

  /**
   * Get node by ID (O(1) lookup)
   */
  getById(document: SemanticDocument, id: SemanticId): SemanticNode | undefined {
    return document.index.get(id);
  }
}

/**
 * Create a new SemanticDOM instance
 */
export function createSemanticDOM(config?: SemanticDOMConfig): SemanticDOM {
  return new SemanticDOM(config);
}

/**
 * Parse an element directly
 */
export function parseElement(element: Element, config?: SemanticDOMConfig): SemanticDocument {
  return createSemanticDOM(config).parse(element);
}
