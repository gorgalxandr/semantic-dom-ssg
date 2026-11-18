/**
 * SemanticDOM CLI
 * Validation and generation tool for SemanticDOM compliance
 *
 * @packageDocumentation
 */

import { Command, InvalidArgumentError, Option } from 'commander';
import type { AgentCertification, SemanticDocument } from '../core/types.js';
import { CERTIFICATION_LEVELS, VERSION } from '../core/constants.js';
import { meetsLevel } from '../core/certification.js';
import { toSerializable } from '../core/serialize.js';
import { serveStdio } from '../mcp/server.js';
import { compareTokenUsage, toAgentSummary, toOneLiner } from '../summary/index.js';
import { estimateTokenSavings, toTOON } from '../toon/index.js';
import {
  analyzeDocument,
  colorEnabled,
  createPainter,
  formatStats,
  formatTree,
  formatValidation,
} from './format.js';
import { parseHTML, readInput, writeOutput } from './io.js';

type Level = AgentCertification['level'];

interface ValidateOptions {
  level: Level;
  format: 'text' | 'json';
  strict?: boolean;
  color?: boolean;
  url?: string;
}

interface ParseOptions {
  output?: string;
  format: 'json' | 'tree' | 'toon' | 'summary' | 'oneline';
  stateGraph?: boolean;
  color?: boolean;
  url?: string;
  maxNodes?: number;
}

interface TextOrJson {
  format: 'text' | 'json';
  color?: boolean;
}

const info = (message: string): void => void process.stderr.write(message + '\n');
const print = (message: string): void => void process.stdout.write(message + '\n');

function positiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== value.trim()) {
    throw new InvalidArgumentError('Expected a positive integer.');
  }
  return parsed;
}

function formatOption(choices: string[], fallback: string): Option {
  return new Option('-f, --format <format>', 'Output format').choices(choices).default(fallback);
}

const urlOption = (): Option =>
  new Option('--url <url>', 'URL the HTML was loaded from, recorded in the output');

/** Exit code for a validation: errors always fail, warnings only with --strict */
export function validationExitCode(
  certification: AgentCertification,
  target: Level,
  strict: boolean
): number {
  const severities = new Set(certification.failures.map((f) => f.severity));
  if (severities.has('critical') || severities.has('error')) return 1;
  if (strict && severities.has('warning')) return 1;
  return meetsLevel(certification.level, target) ? 0 : 1;
}

function renderDocument(document: SemanticDocument, options: ParseOptions): string {
  const paint = createPainter(!options.output && colorEnabled(options.color, process.stdout));
  const dim = createPainter(colorEnabled(options.color, process.stderr));

  switch (options.format) {
    case 'tree':
      return formatTree(document, paint);
    case 'toon': {
      const s = estimateTokenSavings(document);
      info(dim('dim', `TOON format: ~${s.savingsPercent}% token savings (${s.toonTokens} vs ${s.jsonTokens} tokens)`));
      return toTOON(document);
    }
    case 'summary': {
      const s = compareTokenUsage(document);
      info(dim('dim', `Summary format: ~${s.savingsPercent}% token savings (${s.summary} vs ${s.json} tokens)`));
      return toAgentSummary(document);
    }
    case 'oneline':
      return toOneLiner(document);
    default:
      return JSON.stringify(
        toSerializable(document, { includeStateGraph: options.stateGraph !== false }),
        null,
        2
      );
  }
}

function eslintConfig(options: { strict?: boolean }): string {
  const preset = options.strict ? 'strict' : 'recommended';
  return [
    '// eslint.config.js',
    "import semanticDom from 'semantic-dom-ssg/eslint-plugin';",
    '',
    'export default [',
    `  semanticDom.configs['flat/${preset}'],`,
    '];',
  ].join('\n');
}

/** Build the CLI program */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('semantic-dom')
    .description('SemanticDOM & SSG validation and generation CLI')
    .version(VERSION)
    .showHelpAfterError();

  program
    .command('validate')
    .description('Validate HTML for SemanticDOM compliance')
    .argument('<file>', 'HTML file to validate (use - for stdin)')
    .addOption(
      new Option('-l, --level <level>', 'Certification level the document must reach')
        .choices([...CERTIFICATION_LEVELS])
        .default('standard')
    )
    .addOption(formatOption(['text', 'json'], 'text'))
    .addOption(urlOption())
    .option('--strict', 'Fail on warnings')
    .option('--no-color', 'Disable colored output')
    .action(async (file: string, options: ValidateOptions) => {
      const document = await parseHTML(
        await readInput(file),
        { targetCertification: options.level },
        options.url
      );
      const certification = document.agentReady;

      if (options.format === 'json') {
        print(JSON.stringify({ certification, truncated: document.truncated === true }, null, 2));
      } else {
        print(formatValidation(certification, createPainter(colorEnabled(options.color, process.stdout))));
      }
      process.exitCode = validationExitCode(certification, options.level, options.strict ?? false);
    });

  program
    .command('parse')
    .description('Parse HTML and output SemanticDOM structure')
    .argument('<file>', 'HTML file to parse (use - for stdin)')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .addOption(formatOption(['json', 'tree', 'toon', 'summary', 'oneline'], 'json'))
    .addOption(urlOption())
    .option('--max-nodes <count>', 'Stop after this many nodes', positiveInt)
    .option('--no-state-graph', 'Exclude state graph from output')
    .option('--no-bounds', 'Accepted for compatibility; bounds are never computed outside a browser')
    .option('--no-color', 'Disable colored output')
    .action(async (file: string, options: ParseOptions) => {
      const document = await parseHTML(
        await readInput(file),
        { includeStateGraph: options.stateGraph !== false, maxNodes: options.maxNodes },
        options.url
      );
      if (document.truncated) info('Warning: document was truncated (node or depth limit reached)');

      const output = renderDocument(document, options);
      if (options.output) {
        await writeOutput(options.output, output + '\n');
        info(`Output written to ${options.output}`);
      } else {
        print(output);
      }
    });

  program
    .command('stats')
    .description('Show statistics about HTML semantic structure')
    .argument('<file>', 'HTML file to analyze (use - for stdin)')
    .addOption(formatOption(['text', 'json'], 'text'))
    .option('--no-color', 'Disable colored output')
    .action(async (file: string, options: TextOrJson) => {
      const stats = analyzeDocument(await parseHTML(await readInput(file)));
      print(
        options.format === 'json'
          ? JSON.stringify(stats, null, 2)
          : formatStats(stats, createPainter(colorEnabled(options.color, process.stdout)))
      );
    });

  program
    .command('tokens')
    .description('Compare estimated token usage between output formats')
    .argument('<file>', 'HTML file to analyze (use - for stdin)')
    .addOption(formatOption(['text', 'json'], 'text'))
    .action(async (file: string, options: TextOrJson) => {
      const document = await parseHTML(await readInput(file));
      const toon = estimateTokenSavings(document);
      const result = {
        json: toon.jsonTokens,
        toon: toon.toonTokens,
        summary: compareTokenUsage(document).summary,
        oneline: Math.ceil(toOneLiner(document).length / 4),
      };
      if (options.format === 'json') {
        print(JSON.stringify(result, null, 2));
        return;
      }
      print('Estimated tokens (~4 characters per token):');
      for (const [name, tokens] of Object.entries(result)) {
        const saved = result.json > 0 ? Math.floor((1 - tokens / result.json) * 100) : 0;
        print(`  ${name.padEnd(8)} ${String(tokens).padStart(8)}${name === 'json' ? '' : `  (${saved}% smaller)`}`);
      }
    });

  program
    .command('mcp')
    .description('Serve one HTML file to an MCP client over stdio')
    .argument('<file>', 'HTML file to serve')
    .addOption(urlOption())
    .action(async (file: string, options: { url?: string }) => {
      if (file === '-') throw new Error('The mcp command needs a file path; stdin carries the protocol.');
      // Parse once up front so a bad file fails before the client connects.
      let document = await parseHTML(await readInput(file), {}, options.url);
      await serveStdio({
        getDocument: async () => {
          try {
            document = await parseHTML(await readInput(file), {}, options.url);
          } catch {
            // Keep serving the last good parse if the file is briefly unreadable.
          }
          return document;
        },
      });
    });

  program
    .command('init')
    .description('Print an ESLint flat config that enables the SemanticDOM rules')
    .option('--strict', 'Use the strict rule set')
    .option('--react', 'Accepted for compatibility; the rules already cover JSX')
    .option('--eslint', 'Accepted for compatibility')
    .action((options: { strict?: boolean }) => {
      print(eslintConfig(options));
    });

  return program;
}

/** Run the CLI with the given arguments (defaults to process.argv) */
export async function run(argv: readonly string[] = process.argv): Promise<void> {
  try {
    await createProgram().parseAsync([...argv]);
  } catch (error) {
    info(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
