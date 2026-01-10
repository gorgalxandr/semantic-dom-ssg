/**
 * SemanticDOM CLI
 * Validation and generation tool for SemanticDOM compliance
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createSemanticDOM } from '../core/semantic-dom.js';
import type { SemanticDocument, AgentCertification } from '../core/types.js';

const VERSION = '0.1.0';

// CLI Option Types
interface ValidateOptions {
  level: string;
  format: string;
  strict?: boolean;
  color?: boolean;
}

interface ParseOptions {
  output?: string;
  format: string;
  stateGraph?: boolean;
  bounds?: boolean;
}

interface StatsOptions {
  format: string;
}

interface InitOptions {
  react?: boolean;
  eslint?: boolean;
}

const program = new Command();

program
  .name('semantic-dom')
  .description('SemanticDOM & SSG validation and generation CLI')
  .version(VERSION);

/**
 * Validate command - check HTML for SemanticDOM compliance
 */
program
  .command('validate')
  .description('Validate HTML for SemanticDOM compliance')
  .argument('<file>', 'HTML file to validate (use - for stdin)')
  .option('-l, --level <level>', 'Target certification level', 'standard')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--strict', 'Fail on warnings')
  .option('--no-color', 'Disable colored output')
  .action(async (file: string, options: ValidateOptions) => {
    try {
      const html = await readInput(file);
      const result = await validateHTML(html, options.level);

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printValidationResult(result, options);
      }

      const exitCode = calculateExitCode(result, options.strict ?? false);
      process.exit(exitCode);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Parse command - generate SemanticDOM from HTML
 */
program
  .command('parse')
  .description('Parse HTML and output SemanticDOM structure')
  .argument('<file>', 'HTML file to parse (use - for stdin)')
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .option('-f, --format <format>', 'Output format (json, tree)', 'json')
  .option('--no-state-graph', 'Exclude state graph from output')
  .option('--no-bounds', 'Exclude bounds calculation')
  .action(async (file: string, options: ParseOptions) => {
    try {
      const html = await readInput(file);
      const document = await parseHTML(html, {
        includeStateGraph: options.stateGraph !== false,
        computeBounds: options.bounds !== false,
      });

      const output = options.format === 'tree'
        ? formatAsTree(document)
        : formatAsJSON(document);

      if (options.output) {
        await writeOutput(options.output, output);
        console.log(chalk.green(`Output written to ${options.output}`));
      } else {
        console.log(output);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Stats command - show statistics about SemanticDOM structure
 */
program
  .command('stats')
  .description('Show statistics about HTML semantic structure')
  .argument('<file>', 'HTML file to analyze (use - for stdin)')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .action(async (file: string, options: StatsOptions) => {
    try {
      const html = await readInput(file);
      const stats = await analyzeHTML(html);

      if (options.format === 'json') {
        console.log(JSON.stringify(stats, null, 2));
      } else {
        printStats(stats);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Init command - generate SemanticDOM config file
 */
program
  .command('init')
  .description('Initialize SemanticDOM configuration in current project')
  .option('--react', 'Include React integration')
  .option('--eslint', 'Include ESLint plugin config')
  .action((options: InitOptions) => {
    try {
      const config = generateConfig(options);
      console.log(chalk.green('SemanticDOM configuration:'));
      console.log(config);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Read input from file or stdin
 */
async function readInput(file: string): Promise<string> {
  if (file === '-') {
    return readStdin();
  }

  const fs = await import('fs/promises');
  return fs.readFile(file, 'utf-8');
}

/**
 * Read from stdin
 */
function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * Write output to file
 */
async function writeOutput(file: string, content: string): Promise<void> {
  const fs = await import('fs/promises');
  await fs.writeFile(file, content, 'utf-8');
}

/**
 * Parse HTML to SemanticDocument
 */
async function parseHTML(
  html: string,
  config: { includeStateGraph?: boolean; computeBounds?: boolean }
): Promise<SemanticDocument> {
  // Use JSDOM in Node.js
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(html);
  const sdom = createSemanticDOM({
    ...config,
    computeBounds: false, // JSDOM doesn't support getBoundingClientRect properly
  });

  return sdom.parse(
    dom.window.document.body as unknown as Element,
    'file://local',
    dom.window.document.title
  );
}

/**
 * Validate HTML and return results
 */
async function validateHTML(
  html: string,
  _targetLevel: string
): Promise<{ certification: AgentCertification; document: SemanticDocument }> {
  const document = await parseHTML(html, { includeStateGraph: true });
  return { certification: document.agentReady, document };
}

/**
 * Print validation result
 */
function printValidationResult(
  result: { certification: AgentCertification; document: SemanticDocument },
  options: { color?: boolean; strict?: boolean }
): void {
  const { certification } = result;
  const useColor = options.color !== false;

  console.log();
  console.log(useColor ? chalk.bold('SemanticDOM Validation Report') : 'SemanticDOM Validation Report');
  console.log(useColor ? chalk.dim('═'.repeat(50)) : '═'.repeat(50));
  console.log();

  // Certification level
  const levelColors: Record<string, (s: string) => string> = {
    full: chalk.green,
    advanced: chalk.blue,
    standard: chalk.yellow,
    basic: chalk.magenta,
    none: chalk.red,
  };
  const levelColor = useColor ? (levelColors[certification.level] || chalk.white) : (s: string) => s;

  console.log(`Certification Level: ${levelColor(certification.level.toUpperCase())}`);
  console.log(`Score: ${certification.score}/100`);
  console.log();

  // Passed checks
  if (certification.checks.length > 0) {
    console.log(useColor ? chalk.green('Passed Checks:') : 'Passed Checks:');
    for (const check of certification.checks) {
      console.log(`  ${useColor ? chalk.green('✓') : '✓'} ${check.name}`);
    }
    console.log();
  }

  // Failed checks
  if (certification.failures.length > 0) {
    console.log(useColor ? chalk.red('Failed Checks:') : 'Failed Checks:');
    for (const check of certification.failures) {
      const severityColor = getSeverityColor(check.severity, useColor);
      console.log(`  ${useColor ? chalk.red('✗') : '✗'} ${check.name}`);
      console.log(`    ${severityColor(`[${check.severity}]`)} ${check.message}`);
      if (check.nodes && check.nodes.length > 0) {
        console.log(`    Affected nodes: ${check.nodes.slice(0, 3).join(', ')}${check.nodes.length > 3 ? '...' : ''}`);
      }
    }
    console.log();
  }

  // Summary
  console.log(useColor ? chalk.dim('─'.repeat(50)) : '─'.repeat(50));
  console.log(`Total: ${certification.checks.length} passed, ${certification.failures.length} failed`);
}

/**
 * Get color function for severity
 */
function getSeverityColor(severity: string | undefined, useColor: boolean): (s: string) => string {
  if (!useColor) return (s) => s;

  switch (severity) {
    case 'critical':
      return chalk.bgRed.white;
    case 'error':
      return chalk.red;
    case 'warning':
      return chalk.yellow;
    case 'info':
      return chalk.blue;
    default:
      return chalk.white;
  }
}

/**
 * Calculate exit code based on validation result
 */
function calculateExitCode(
  result: { certification: AgentCertification },
  strict: boolean
): number {
  const { certification } = result;

  const hasErrors = certification.failures.some(
    (f) => f.severity === 'critical' || f.severity === 'error'
  );
  const hasWarnings = certification.failures.some((f) => f.severity === 'warning');

  if (hasErrors) return 1;
  if (strict && hasWarnings) return 1;
  return 0;
}

/**
 * Analyze HTML and return statistics
 */
async function analyzeHTML(html: string): Promise<Record<string, unknown>> {
  const document = await parseHTML(html, { includeStateGraph: true });

  const roleCounts: Record<string, number> = {};
  const intentCounts: Record<string, number> = {};
  const stateCounts: Record<string, number> = {};

  let totalNodes = 0;
  let interactiveNodes = 0;
  let accessibleNodes = 0;
  let nodesWithIntent = 0;

  const traverse = (node: typeof document.root): void => {
    totalNodes++;

    roleCounts[node.role] = (roleCounts[node.role] || 0) + 1;
    stateCounts[node.state] = (stateCounts[node.state] || 0) + 1;

    if (node.intent) {
      intentCounts[node.intent] = (intentCounts[node.intent] || 0) + 1;
      nodesWithIntent++;
    }

    if (node.a11y.focusable) interactiveNodes++;
    if (node.a11y.name) accessibleNodes++;

    node.children.forEach(traverse);
  };

  traverse(document.root);

  return {
    summary: {
      totalNodes,
      interactiveNodes,
      accessibleNodes,
      nodesWithIntent,
      landmarks: document.landmarks.length,
      interactables: document.interactables.length,
      certificationLevel: document.agentReady.level,
      certificationScore: document.agentReady.score,
    },
    roles: roleCounts,
    intents: intentCounts,
    states: stateCounts,
    stateGraphNodes: document.stateGraph.size,
  };
}

/**
 * Print statistics
 */
function printStats(stats: Record<string, unknown>): void {
  console.log();
  console.log(chalk.bold('SemanticDOM Statistics'));
  console.log(chalk.dim('═'.repeat(50)));
  console.log();

  const summary = stats.summary as Record<string, number | string>;
  console.log(chalk.cyan('Summary:'));
  console.log(`  Total nodes: ${summary.totalNodes}`);
  console.log(`  Interactive: ${summary.interactiveNodes}`);
  console.log(`  Accessible:  ${summary.accessibleNodes}`);
  console.log(`  With intent: ${summary.nodesWithIntent}`);
  console.log(`  Landmarks:   ${summary.landmarks}`);
  console.log(`  Certification: ${summary.certificationLevel} (${summary.certificationScore}/100)`);
  console.log();

  const roles = stats.roles as Record<string, number>;
  console.log(chalk.cyan('Role Distribution:'));
  const sortedRoles = Object.entries(roles).sort((a, b) => b[1] - a[1]);
  for (const [role, count] of sortedRoles.slice(0, 10)) {
    const bar = '█'.repeat(Math.min(count, 20));
    console.log(`  ${role.padEnd(15)} ${count.toString().padStart(4)} ${chalk.blue(bar)}`);
  }
  if (sortedRoles.length > 10) {
    console.log(`  ... and ${sortedRoles.length - 10} more roles`);
  }
}

/**
 * Format document as JSON
 */
function formatAsJSON(document: SemanticDocument): string {
  const serializeNode = (node: typeof document.root): Record<string, unknown> => ({
    id: node.id,
    role: node.role,
    label: node.label,
    intent: node.intent,
    state: node.state,
    selector: node.selector,
    a11y: node.a11y,
    children: node.children.map(serializeNode),
  });

  return JSON.stringify(
    {
      version: document.version,
      standard: document.standard,
      url: document.url,
      title: document.title,
      language: document.language,
      generatedAt: document.generatedAt,
      agentReady: document.agentReady,
      root: serializeNode(document.root),
    },
    null,
    2
  );
}

/**
 * Format document as tree
 */
function formatAsTree(document: SemanticDocument): string {
  const lines: string[] = [];

  const printNode = (node: typeof document.root, prefix: string, isLast: boolean): void => {
    const connector = isLast ? '└── ' : '├── ';
    const roleColor = getNodeColor(node.role);
    const stateIndicator = node.state !== 'idle' ? ` [${node.state}]` : '';
    const intentIndicator = node.intent ? ` → ${node.intent}` : '';

    lines.push(
      `${prefix}${connector}${roleColor(node.role)}${stateIndicator}${intentIndicator}` +
        (node.label && node.label !== node.role ? ` "${truncate(node.label, 30)}"` : '')
    );

    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    node.children.forEach((child, i) => {
      printNode(child, childPrefix, i === node.children.length - 1);
    });
  };

  printNode(document.root, '', true);
  return lines.join('\n');
}

/**
 * Get color for node role
 */
function getNodeColor(role: string): (s: string) => string {
  const interactiveRoles = ['button', 'link', 'textbox', 'checkbox', 'radio'];
  const landmarkRoles = ['main', 'navigation', 'header', 'footer', 'aside'];

  if (interactiveRoles.includes(role)) return chalk.cyan;
  if (landmarkRoles.includes(role)) return chalk.green;
  return chalk.white;
}

/**
 * Truncate string
 */
function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + '...';
}

/**
 * Generate configuration
 */
function generateConfig(options: { react?: boolean; eslint?: boolean }): string {
  const config: Record<string, unknown> = {
    extends: ['semantic-dom/recommended'],
    rules: {
      'semantic-dom/require-accessible-name': 'error',
      'semantic-dom/valid-role': 'warn',
      'semantic-dom/semantic-intent': 'warn',
    },
  };

  if (options.react) {
    (config.extends as string[]).push('semantic-dom/react');
    config.rules = {
      ...config.rules as object,
      'semantic-dom/react-hooks': 'error',
    };
  }

  return JSON.stringify(config, null, 2);
}

// Parse CLI arguments
program.parse();
