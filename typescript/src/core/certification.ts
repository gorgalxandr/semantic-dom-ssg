/**
 * Agent-readiness certification: validation checks and completeness scoring
 */

import type {
  AgentCertification,
  SemanticId,
  SemanticNode,
  SSGNode,
  ValidationCheck,
} from './types.js';
import { CERTIFICATION_LEVELS } from './constants.js';
import { isInteractiveRole } from './roles.js';
import { isDeterministic } from './state-graph.js';

type Level = AgentCertification['level'];
type Category = ValidationCheck['category'];
type Severity = NonNullable<ValidationCheck['severity']>;

/** Everything the checks need, computed once per document */
interface Facts {
  all: SemanticNode[];
  interactive: SemanticNode[];
  stateGraph: Map<SemanticId, SSGNode>;
  includeStateGraph: boolean;
}

/** Category weights; state checks count towards navigation */
const WEIGHTS: Readonly<Record<Exclude<Category, 'state'>, number>> = {
  structure: 0.3,
  a11y: 0.3,
  navigation: 0.25,
  interoperability: 0.15,
};

const MAX_REPORTED_NODES = 50;

function check(
  id: string,
  name: string,
  category: Category,
  passed: boolean,
  okMessage: string,
  failMessage: string,
  severity: Severity,
  nodes?: SemanticId[]
): ValidationCheck {
  return {
    id,
    name,
    category,
    passed,
    message: passed ? okMessage : failMessage,
    severity: passed ? undefined : severity,
    ...(nodes && nodes.length > 0 ? { nodes: nodes.slice(0, MAX_REPORTED_NODES) } : {}),
  };
}

function ratio(part: number, whole: number, whenEmpty = 1): number {
  return whole > 0 ? part / whole : whenEmpty;
}

function checkStructure({ all }: Facts): ValidationCheck {
  const hasMain = all.some((n) => n.role === 'main');
  return check(
    'structure-main', 'Main landmark present', 'structure', hasMain,
    'Document has main landmark', 'Document should have a main landmark', 'warning'
  );
}

function checkLandmarks({ all }: Facts): ValidationCheck {
  const roles = new Set(['main', 'navigation', 'header', 'footer']);
  const count = all.filter((n) => roles.has(n.role)).length;
  return check(
    'structure-landmarks', 'Sufficient landmarks', 'structure', count >= 2,
    `Found ${count} landmarks`, 'Document should have at least 2 landmarks', 'warning'
  );
}

function checkAccessibleNames({ interactive }: Facts): ValidationCheck {
  const unnamed = interactive.filter((n) => n.state !== 'hidden' && !n.a11y.name);
  return check(
    'a11y-names', 'Interactive elements have accessible names', 'a11y', unnamed.length === 0,
    'All interactive elements have accessible names',
    `${unnamed.length} interactive elements missing accessible names`,
    'error',
    unnamed.map((n) => n.id)
  );
}

function checkHeadingHierarchy({ all }: Facts): ValidationCheck {
  const skipped: SemanticId[] = [];
  let lastLevel = 0;

  for (const heading of all) {
    if (heading.role !== 'heading') continue;
    const level = heading.a11y.level ?? 1;
    if (level > lastLevel + 1) skipped.push(heading.id);
    lastLevel = level;
  }

  return check(
    'a11y-headings', 'Heading hierarchy valid', 'a11y', skipped.length === 0,
    'Heading levels follow proper hierarchy',
    'Heading levels skip levels (e.g., h1 to h3)',
    'warning',
    skipped
  );
}

function checkKeyboardNav({ all, interactive }: Facts): ValidationCheck {
  const inTabOrder = all.filter((n) => n.a11y.inTabOrder).length;
  // A page with nothing to interact with has nothing to reach by keyboard.
  const passed = inTabOrder > 0 || interactive.length === 0;
  return check(
    'navigation-keyboard', 'Keyboard navigation available', 'navigation', passed,
    `${inTabOrder} elements in tab order`, 'No elements in keyboard tab order', 'error'
  );
}

function checkUniqueIds({ all }: Facts): ValidationCheck {
  const ids = new Set<SemanticId>();
  const duplicates: SemanticId[] = [];
  for (const node of all) {
    if (ids.has(node.id)) duplicates.push(node.id);
    ids.add(node.id);
  }
  return check(
    'navigation-unique-ids', 'All semantic IDs unique', 'navigation', duplicates.length === 0,
    'All IDs are unique', `${duplicates.length} duplicate IDs found`, 'critical', duplicates
  );
}

function checkSelectors({ all }: Facts): ValidationCheck {
  const missing = all.filter((n) => !n.selector);
  return check(
    'navigation-selectors', 'All nodes have valid selectors', 'navigation', missing.length === 0,
    'All nodes have CSS selectors', `${missing.length} nodes missing selectors`, 'error',
    missing.map((n) => n.id)
  );
}

function checkStateTransitions({ interactive, stateGraph, includeStateGraph }: Facts): ValidationCheck {
  const covered = interactive.filter((n) => stateGraph.has(n.id)).length;
  const coverage = ratio(covered, interactive.length);
  const failMessage = includeStateGraph
    ? 'Insufficient state transition coverage'
    : 'State graph generation is disabled (includeStateGraph: false)';
  return check(
    'state-transitions', 'State transitions defined', 'state', coverage >= 0.8,
    `${Math.round(coverage * 100)}% state coverage`, failMessage, 'warning'
  );
}

function checkDeterministicStates({ stateGraph }: Facts): ValidationCheck {
  const ambiguous: SemanticId[] = [];
  for (const [id, node] of stateGraph) {
    if (!isDeterministic(node.transitions)) ambiguous.push(id);
  }
  return check(
    'state-deterministic', 'State graph is deterministic', 'state', ambiguous.length === 0,
    'Every state has at most one transition per trigger',
    `${ambiguous.length} elements have ambiguous transitions`,
    'error',
    ambiguous
  );
}

function checkSemanticIntent({ interactive }: Facts): ValidationCheck {
  const coverage = ratio(interactive.filter((n) => n.intent).length, interactive.length);
  return check(
    'interop-intent', 'Semantic intents defined', 'interoperability', coverage >= 0.7,
    `${Math.round(coverage * 100)}% intent coverage`,
    'Many interactive elements lack semantic intent',
    'info'
  );
}

/**
 * Completeness score out of 100: 70 points from weighted check categories
 * (Structure 30%, A11y 30%, Navigation 25%, Interoperability 15%) plus up to
 * 30 points for how completely nodes are named, located and given intents.
 */
function calculateScore(facts: Facts, checks: ValidationCheck[]): number {
  const totals = new Map<string, { passed: number; count: number }>();
  for (const c of checks) {
    const category = c.category === 'state' ? 'navigation' : c.category;
    const entry = totals.get(category) ?? { passed: 0, count: 0 };
    entry.count++;
    if (c.passed) entry.passed++;
    totals.set(category, entry);
  }

  let weighted = 0;
  let totalWeight = 0;
  for (const [category, weight] of Object.entries(WEIGHTS)) {
    const entry = totals.get(category);
    if (!entry || entry.count === 0) continue;
    weighted += (entry.passed / entry.count) * weight;
    totalWeight += weight;
  }
  const baseScore = totalWeight > 0 ? (weighted / totalWeight) * 70 : 0;

  const { all, interactive } = facts;
  // Nodes that are expected to carry a human-readable name.
  const nameable = all.filter(
    (n) => isInteractiveRole(n.role) || n.role === 'heading' || n.role === 'img'
  );
  // With nothing to measure a factor earns half credit: an empty page must not
  // collect full marks for the controls it does not have.
  const NEUTRAL = 0.5;
  const bonus =
    ratio(nameable.filter((n) => n.a11y.name).length, nameable.length, NEUTRAL) * 8 +
    ratio(all.filter((n) => n.selector).length, all.length, 0) * 7 +
    ratio(interactive.filter((n) => n.intent).length, interactive.length, NEUTRAL) * 8 +
    ratio(interactive.filter((n) => n.a11y.name).length, interactive.length, NEUTRAL) * 7;

  return Math.min(100, Math.round(baseScore + bonus));
}

/** Map a score to a certification level */
export function levelForScore(score: number): Level {
  if (score >= 90) return 'full';
  if (score >= 80) return 'advanced';
  if (score >= 70) return 'standard';
  if (score >= 50) return 'basic';
  return 'none';
}

/** True when `level` is at or above `target` */
export function meetsLevel(level: Level, target: Level): boolean {
  return CERTIFICATION_LEVELS.indexOf(level) >= CERTIFICATION_LEVELS.indexOf(target);
}

/** Certification used when validation is switched off */
export function emptyCertification(): AgentCertification {
  return { level: 'none', checks: [], failures: [], score: 0 };
}

/** Run all checks and score a document */
export function certify(
  all: SemanticNode[],
  stateGraph: Map<SemanticId, SSGNode>,
  options: { includeStateGraph: boolean; target: Level }
): AgentCertification {
  const facts: Facts = {
    all,
    interactive: all.filter((n) => isInteractiveRole(n.role)),
    stateGraph,
    includeStateGraph: options.includeStateGraph,
  };

  const checks = [
    checkStructure(facts),
    checkLandmarks(facts),
    checkAccessibleNames(facts),
    checkHeadingHierarchy(facts),
    checkKeyboardNav(facts),
    checkUniqueIds(facts),
    checkSelectors(facts),
    checkStateTransitions(facts),
    checkDeterministicStates(facts),
    checkSemanticIntent(facts),
  ];

  const score = calculateScore(facts, checks);
  const level = levelForScore(score);

  return {
    level,
    checks: checks.filter((c) => c.passed),
    failures: checks.filter((c) => !c.passed),
    score,
    certifiedAt: Date.now(),
    target: options.target,
    meetsTarget: meetsLevel(level, options.target),
  };
}
