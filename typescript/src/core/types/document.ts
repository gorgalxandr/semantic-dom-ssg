import type { SemanticId } from './vocabulary.js';
import type { SemanticNode } from './node.js';
import type { SSGNode } from './state-graph.js';

/**
 * SemanticDOM document representation
 */
export interface SemanticDocument {
  /**
   * Document version
   */
  version: string;

  /**
   * ISO/IEC draft standard reference
   */
  standard: 'ISO/IEC-SDOM-SSG-DRAFT-2024';

  /**
   * Document URL
   */
  url: string;

  /**
   * Document title
   */
  title: string;

  /**
   * Root semantic node
   */
  root: SemanticNode;

  /**
   * Flat index for O(1) lookup
   */
  index: Map<SemanticId, SemanticNode>;

  /**
   * Semantic State Graph
   */
  stateGraph: Map<SemanticId, SSGNode>;

  /**
   * Landmarks for quick navigation
   */
  landmarks: SemanticNode[];

  /**
   * Interactive elements
   */
  interactables: SemanticNode[];

  /**
   * Document language
   */
  language: string;

  /**
   * Generation timestamp
   */
  generatedAt: number;

  /**
   * Agent certification level
   */
  agentReady: AgentCertification;

  /**
   * True when parsing stopped early because `maxNodes` or `maxDepth` was hit.
   * A truncated document is still valid but does not cover the whole DOM.
   */
  truncated?: boolean;
}

/**
 * Agent certification levels
 */
export interface AgentCertification {
  /**
   * Certification level
   */
  level: 'none' | 'basic' | 'standard' | 'advanced' | 'full';

  /**
   * Passed validation checks
   */
  checks: ValidationCheck[];

  /**
   * Failed validation checks
   */
  failures: ValidationCheck[];

  /**
   * Certification score (0-100)
   */
  score: number;

  /**
   * Certification timestamp
   */
  certifiedAt?: number;

  /**
   * Certification level requested via `targetCertification`
   */
  target?: AgentCertification['level'];

  /**
   * Whether `level` is at or above `target`
   */
  meetsTarget?: boolean;
}

/**
 * Validation check result
 */
export interface ValidationCheck {
  /**
   * Check identifier
   */
  id: string;

  /**
   * Check name
   */
  name: string;

  /**
   * Check category
   */
  category: 'structure' | 'a11y' | 'navigation' | 'state' | 'interoperability';

  /**
   * Whether check passed
   */
  passed: boolean;

  /**
   * Check message
   */
  message: string;

  /**
   * Severity if failed
   */
  severity?: 'info' | 'warning' | 'error' | 'critical';

  /**
   * Related nodes
   */
  nodes?: SemanticId[];
}
