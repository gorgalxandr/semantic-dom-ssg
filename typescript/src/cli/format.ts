/**
 * CLI output formatting
 */

import { styleText } from 'node:util';
import type { AgentCertification, SemanticDocument, SemanticNode } from '../core/types.js';
import { INTERACTIVE_ROLES, LANDMARK_ROLES } from '../core/constants.js';
import { flattenTree } from '../core/traversal.js';

type Style = Parameters<typeof styleText>[0];
export type Painter = (style: Style, text: string) => string;

/** Build a painter that emits ANSI colors only when they are wanted */
export function createPainter(enabled: boolean): Painter {
  return (style, text) => (enabled ? styleText(style, text, { validateStream: false }) : text);
}

/** Colors are used on a TTY unless --no-color or NO_COLOR says otherwise */
export function colorEnabled(flag: boolean | undefined, stream: { isTTY?: boolean }): boolean {
  if (flag === false || process.env.NO_COLOR) return false;
  return Boolean(process.env.FORCE_COLOR) || Boolean(stream.isTTY);
}

const LEVEL_STYLES: Record<AgentCertification['level'], Style> = {
  full: 'green',
  advanced: 'blue',
  standard: 'yellow',
  basic: 'magenta',
  none: 'red',
};

const SEVERITY_STYLES: Record<string, Style> = {
  critical: ['bgRed', 'white'],
  error: 'red',
  warning: 'yellow',
  info: 'blue',
};

/** Render a validation report as text */
export function formatValidation(certification: AgentCertification, paint: Painter): string {
  const lines: string[] = [
    '',
    paint('bold', 'SemanticDOM Validation Report'),
    paint('dim', '═'.repeat(50)),
    '',
    `Certification Level: ${paint(LEVEL_STYLES[certification.level], certification.level.toUpperCase())}`,
    `Score: ${certification.score}/100`,
  ];

  if (certification.target) {
    const verdict = certification.meetsTarget ? paint('green', 'met') : paint('red', 'not met');
    lines.push(`Target: ${certification.target} (${verdict})`);
  }
  lines.push('');

  if (certification.checks.length > 0) {
    lines.push(paint('green', 'Passed Checks:'));
    for (const check of certification.checks) {
      lines.push(`  ${paint('green', '✓')} ${check.name}`);
    }
    lines.push('');
  }

  if (certification.failures.length > 0) {
    lines.push(paint('red', 'Failed Checks:'));
    for (const check of certification.failures) {
      const severity = check.severity ?? 'info';
      lines.push(`  ${paint('red', '✗')} ${check.name}`);
      lines.push(`    ${paint(SEVERITY_STYLES[severity] ?? 'white', `[${severity}]`)} ${check.message}`);
      if (check.nodes && check.nodes.length > 0) {
        const shown = check.nodes.slice(0, 3).join(', ');
        lines.push(`    Affected nodes: ${shown}${check.nodes.length > 3 ? '...' : ''}`);
      }
    }
    lines.push('');
  }

  lines.push(paint('dim', '─'.repeat(50)));
  lines.push(`Total: ${certification.checks.length} passed, ${certification.failures.length} failed`);
  return lines.join('\n');
}

/** Statistics about a parsed document */
export interface DocumentStats {
  summary: {
    totalNodes: number;
    interactiveNodes: number;
    focusableNodes: number;
    accessibleNodes: number;
    nodesWithIntent: number;
    landmarks: number;
    interactables: number;
    certificationLevel: string;
    certificationScore: number;
    truncated: boolean;
  };
  roles: Record<string, number>;
  intents: Record<string, number>;
  states: Record<string, number>;
  stateGraphNodes: number;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (Object.hasOwn(counts, key) ? counts[key] : 0) + 1;
}

/** Compute statistics for a document */
export function analyzeDocument(document: SemanticDocument): DocumentStats {
  const roles: Record<string, number> = Object.create(null) as Record<string, number>;
  const intents: Record<string, number> = Object.create(null) as Record<string, number>;
  const states: Record<string, number> = Object.create(null) as Record<string, number>;
  const all = flattenTree(document.root);

  let focusableNodes = 0;
  let accessibleNodes = 0;
  let nodesWithIntent = 0;

  for (const node of all) {
    increment(roles, node.role);
    increment(states, node.state);
    if (node.intent) {
      increment(intents, node.intent);
      nodesWithIntent++;
    }
    if (node.a11y.focusable) focusableNodes++;
    if (node.a11y.name) accessibleNodes++;
  }

  return {
    summary: {
      totalNodes: all.length,
      interactiveNodes: document.interactables.length,
      focusableNodes,
      accessibleNodes,
      nodesWithIntent,
      landmarks: document.landmarks.length,
      interactables: document.interactables.length,
      certificationLevel: document.agentReady.level,
      certificationScore: document.agentReady.score,
      truncated: document.truncated === true,
    },
    roles: { ...roles },
    intents: { ...intents },
    states: { ...states },
    stateGraphNodes: document.stateGraph.size,
  };
}

/** Render statistics as text */
export function formatStats(stats: DocumentStats, paint: Painter): string {
  const { summary } = stats;
  const lines: string[] = [
    '',
    paint('bold', 'SemanticDOM Statistics'),
    paint('dim', '═'.repeat(50)),
    '',
    paint('cyan', 'Summary:'),
    `  Total nodes: ${summary.totalNodes}${summary.truncated ? ' (truncated)' : ''}`,
    `  Interactive: ${summary.interactiveNodes}`,
    `  Focusable:   ${summary.focusableNodes}`,
    `  Accessible:  ${summary.accessibleNodes}`,
    `  With intent: ${summary.nodesWithIntent}`,
    `  Landmarks:   ${summary.landmarks}`,
    `  Certification: ${summary.certificationLevel} (${summary.certificationScore}/100)`,
    '',
    paint('cyan', 'Role Distribution:'),
  ];

  const sorted = Object.entries(stats.roles).sort((a, b) => b[1] - a[1]);
  for (const [role, count] of sorted.slice(0, 10)) {
    const bar = '█'.repeat(Math.min(count, 20));
    lines.push(`  ${role.padEnd(15)} ${count.toString().padStart(4)} ${paint('blue', bar)}`);
  }
  if (sorted.length > 10) {
    lines.push(`  ... and ${sorted.length - 10} more roles`);
  }
  return lines.join('\n');
}

function truncate(text: string, length: number): string {
  const chars = Array.from(text);
  return chars.length <= length ? text : chars.slice(0, length - 3).join('') + '...';
}

function roleStyle(role: SemanticNode['role']): Style {
  if (INTERACTIVE_ROLES.has(role)) return 'cyan';
  if (LANDMARK_ROLES.includes(role)) return 'green';
  return 'white';
}

/** Render a document as an indented tree (iterative, safe for deep trees) */
export function formatTree(document: SemanticDocument, paint: Painter): string {
  const lines: string[] = [];
  const stack: Array<{ node: SemanticNode; prefix: string; isLast: boolean }> = [
    { node: document.root, prefix: '', isLast: true },
  ];

  while (stack.length > 0) {
    const { node, prefix, isLast } = stack.pop() as (typeof stack)[number];
    const state = node.state !== 'idle' ? ` [${node.state}]` : '';
    const intent = node.intent ? ` → ${node.intent}` : '';
    const label = node.a11y.name ? ` "${truncate(node.label, 30)}"` : '';
    lines.push(
      `${prefix}${isLast ? '└── ' : '├── '}${paint(roleStyle(node.role), node.role)}${state}${intent}${label}`
    );

    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push({
        node: node.children[i],
        prefix: childPrefix,
        isLast: i === node.children.length - 1,
      });
    }
  }

  return lines.join('\n');
}
