/**
 * CLI input/output: bounded reads and hardened HTML parsing
 */

import { readFile, stat, writeFile } from 'node:fs/promises';
import type * as JSDOMTypes from 'jsdom';
import type { SemanticDocument, SemanticDOMConfig } from '../core/types.js';
import { createSemanticDOM } from '../core/semantic-dom.js';

/** SECURITY: Maximum input size (10MB) to prevent DoS attacks */
export const MAX_INPUT_SIZE = 10 * 1024 * 1024;

const MB = 1024 * 1024;

function tooLarge(): Error {
  return new Error(`Input exceeds maximum size of ${MAX_INPUT_SIZE / MB}MB`);
}

/**
 * Read stdin, giving up as soon as the limit is crossed instead of buffering
 * an unbounded stream first.
 */
export function readStream(stream: NodeJS.ReadableStream, limit = MAX_INPUT_SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    stream.on('data', (chunk: Buffer | string) => {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      size += buffer.length;
      if (size > limit) {
        (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
        reject(tooLarge());
        return;
      }
      chunks.push(buffer);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}

/** Read input from a file, or stdin when the path is "-" */
export async function readInput(file: string): Promise<string> {
  if (file === '-') return readStream(process.stdin);

  const info = await stat(file);
  if (!info.isFile()) throw new Error(`Not a regular file: ${file}`);
  if (info.size > MAX_INPUT_SIZE) throw tooLarge();

  const content = await readFile(file);
  // The file may have grown between stat and read.
  if (content.length > MAX_INPUT_SIZE) throw tooLarge();
  return content.toString('utf-8');
}

/** Write output to a file */
export async function writeOutput(file: string, content: string): Promise<void> {
  await writeFile(file, content, 'utf-8');
}

type JSDOMModule = typeof JSDOMTypes;

async function loadJSDOM(): Promise<JSDOMModule> {
  try {
    return await import('jsdom');
  } catch {
    throw new Error(
      'The CLI needs the "jsdom" package to parse HTML outside a browser. Install it with: npm install jsdom'
    );
  }
}

/**
 * Parse an HTML string to a SemanticDocument.
 *
 * SECURITY: JSDOM runs with its safe defaults, which this function relies on
 * and must not loosen: no `runScripts` (page scripts never execute) and no
 * `resources` (nothing is fetched). The content type is fixed so the input is
 * always parsed as HTML.
 */
export async function parseHTML(
  html: string,
  config: SemanticDOMConfig = {},
  url = 'file://local'
): Promise<SemanticDocument> {
  if (Buffer.byteLength(html, 'utf-8') > MAX_INPUT_SIZE) throw tooLarge();

  const { JSDOM } = await loadJSDOM();
  const dom = new JSDOM(html, { contentType: 'text/html' });
  try {
    const { document } = dom.window;
    const sdom = createSemanticDOM({
      ...config,
      computeBounds: false, // JSDOM performs no layout
    });
    return sdom.parse(document.body, url, document.title);
  } finally {
    dom.window.close();
  }
}
