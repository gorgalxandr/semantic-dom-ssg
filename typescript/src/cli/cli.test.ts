// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VERSION } from '../core/constants.js';
import type { AgentCertification } from '../core/types.js';
import { analyzeDocument, colorEnabled, createPainter, formatStats, formatTree, formatValidation } from './format.js';
import { createProgram, run, validationExitCode } from './index.js';
import { MAX_INPUT_SIZE, parseHTML, readInput, readStream } from './io.js';

const GOOD = `<!doctype html><html lang="fr"><head><title>Shop</title></head><body>
  <header><a href="/">Home</a></header><nav aria-label="Main"><a href="/p">Products</a></nav>
  <main><h1>Shop</h1><button id="buy" class="btn primary">Buy</button></main><footer><a href="/l">Legal</a></footer>
</body></html>`;
const BAD = '<html><body><h1>x</h1><h4>y</h4><button></button><input type="password" value="hunter2"></body></html>';

let dir: string;
let good: string;
let bad: string;
let out: string[];
let err: string[];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sdom-cli-'));
  good = join(dir, 'good.html');
  bad = join(dir, 'bad.html');
  await writeFile(good, GOOD);
  await writeFile(bad, BAD);
});

afterAll(() => rm(dir, { recursive: true, force: true }));

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

async function cli(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  out = [];
  err = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => (err.push(String(chunk)), true));
  process.exitCode = undefined;
  await run(['node', 'semantic-dom', ...args]);
  const code = Number(process.exitCode ?? 0);
  vi.restoreAllMocks();
  return { stdout: out.join(''), stderr: err.join(''), code };
}

describe('io', () => {
  it('parses HTML with ids and classes (no browser globals needed)', async () => {
    const doc = await parseHTML(GOOD, {}, 'https://shop.example/');
    expect(doc.title).toBe('Shop');
    expect(doc.language).toBe('fr');
    expect(doc.url).toBe('https://shop.example/');
    expect([...doc.index.values()].find((n) => n.role === 'button')?.selector).toBe('#buy');
    expect([...doc.index.values()].every((n) => n.element === undefined && n.bounds === undefined)).toBe(true);
  });

  it('never runs scripts or loads resources from the page', async () => {
    const marker = '__sdom_pwned__';
    await parseHTML(`<body><script>globalThis.${marker} = 1; process.exit(9)</script><img src="x" onerror="globalThis.${marker} = 2"><button>ok</button></body>`);
    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
  });

  it('bounds stdin and file reads', async () => {
    await expect(readStream(Readable.from([Buffer.alloc(600), Buffer.alloc(600)]), 1000)).rejects.toThrow(/maximum size/);
    await expect(readStream(Readable.from(['<p>', 'é</p>']))).resolves.toBe('<p>é</p>');
    await expect(readInput(dir)).rejects.toThrow(/Not a regular file/);
    await expect(readInput(join(dir, 'missing.html'))).rejects.toThrow();
    await expect(parseHTML('x'.repeat(MAX_INPUT_SIZE + 1))).rejects.toThrow(/maximum size/);
    const big = join(dir, 'big.html');
    await writeFile(big, Buffer.alloc(MAX_INPUT_SIZE + 1, 0x20));
    await expect(readInput(big)).rejects.toThrow(/maximum size/);
  });
});

describe('commands', () => {
  it('prints the package version', async () => {
    const program = createProgram().exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    await expect(program.parseAsync(['node', 'x', '--version'])).rejects.toMatchObject({ message: VERSION });
  });

  it('parse emits JSON with redacted secrets', async () => {
    const { stdout, code } = await cli('parse', bad);
    const doc = JSON.parse(stdout) as { root: unknown; stateGraph: Record<string, unknown>; agentReady: AgentCertification };
    expect(code).toBe(0);
    expect(stdout).not.toContain('hunter2');
    expect(Object.keys(doc.stateGraph).length).toBeGreaterThan(0);
    expect(JSON.parse((await cli('parse', bad, '--no-state-graph')).stdout).stateGraph).toEqual({});
  });

  it('parse supports every format and --output', async () => {
    expect((await cli('parse', good, '-f', 'summary', '--url', 'https://shop.example/x')).stdout).toContain('SITE: shop.example');
    expect((await cli('parse', good, '-f', 'oneline')).stdout).toMatch(/^local \| full \(100\) \| 4 landmarks \| 4 actions\n$/);
    expect((await cli('parse', good, '-f', 'toon')).stdout).toContain('interactables[4]');
    expect((await cli('parse', good, '-f', 'tree', '--no-color')).stdout).toContain('└── button → action "Buy"');
    const target = join(dir, 'out.json');
    const written = await cli('parse', good, '-o', target);
    expect(written.stdout).toBe('');
    expect(JSON.parse(await readFile(target, 'utf-8')).title).toBe('Shop');
    const limited = await cli('parse', good, '--max-nodes', '3', '-f', 'oneline');
    expect(limited.stderr).toContain('truncated');
  });

  it('validate honours --level, --strict and severities', async () => {
    expect((await cli('validate', good, '--level', 'full')).code).toBe(0);
    const failing = await cli('validate', bad, '--no-color');
    expect(failing.code).toBe(1);
    expect(failing.stdout).toContain('[error] 2 interactive elements missing accessible names');
    const report = JSON.parse((await cli('validate', bad, '-f', 'json')).stdout) as { certification: AgentCertification };
    expect(report.certification.meetsTarget).toBe(false);

    const base: AgentCertification = { level: 'standard', score: 75, checks: [], failures: [] };
    const warning = { id: 'w', name: 'w', category: 'a11y' as const, passed: false, message: '', severity: 'warning' as const };
    expect(validationExitCode(base, 'standard', false)).toBe(0);
    expect(validationExitCode(base, 'advanced', false)).toBe(1);
    expect(validationExitCode({ ...base, failures: [warning] }, 'basic', false)).toBe(0);
    expect(validationExitCode({ ...base, failures: [warning] }, 'basic', true)).toBe(1);
    expect(validationExitCode({ ...base, failures: [{ ...warning, severity: 'critical' }] }, 'none', false)).toBe(1);
  });

  it('stats, tokens and init', async () => {
    const stats = JSON.parse((await cli('stats', good, '-f', 'json')).stdout) as { summary: Record<string, number>; roles: Record<string, number> };
    expect(stats.summary.interactiveNodes).toBe(4);
    expect(stats.roles.link).toBe(3);
    expect((await cli('stats', good, '--no-color')).stdout).toContain('Certification: full (100/100)');
    const tokens = JSON.parse((await cli('tokens', good, '-f', 'json')).stdout) as Record<string, number>;
    expect(tokens.oneline).toBeLessThan(tokens.summary);
    expect(tokens.summary).toBeLessThan(tokens.toon);
    expect(tokens.toon).toBeLessThan(tokens.json);
    expect((await cli('tokens', good)).stdout).toContain('% smaller');
    expect((await cli('init', '--strict')).stdout).toContain("semanticDom.configs['flat/strict']");
  });

  it('fails cleanly on bad input', async () => {
    const missing = await cli('parse', join(dir, 'nope.html'));
    expect(missing.code).toBe(1);
    expect(missing.stderr).toMatch(/^Error: /);
    expect(missing.stdout).toBe('');
    expect((await cli('mcp', '-')).stderr).toContain('needs a file path');
  });
});

describe('formatting', () => {
  it('colors only when asked', () => {
    expect(createPainter(false)('red', 'x')).toBe('x');
    expect(createPainter(true)('red', 'x')).toContain('\u001b[');
    const before = { ...process.env };
    delete process.env.FORCE_COLOR;
    delete process.env.NO_COLOR;
    expect(colorEnabled(undefined, { isTTY: true })).toBe(true);
    expect(colorEnabled(undefined, { isTTY: false })).toBe(false);
    expect(colorEnabled(false, { isTTY: true })).toBe(false);
    process.env.NO_COLOR = '1';
    expect(colorEnabled(undefined, { isTTY: true })).toBe(false);
    process.env = before;
  });

  it('renders reports', async () => {
    const paint = createPainter(false);
    const doc = await parseHTML(BAD, { targetCertification: 'full' });
    expect(formatValidation(doc.agentReady, paint)).toContain('Target: full (not met)');
    expect(formatTree(doc, paint).split('\n')).toHaveLength(doc.index.size);
    expect(formatStats(analyzeDocument(doc), paint)).toContain('Total nodes: 5');
  });
});
