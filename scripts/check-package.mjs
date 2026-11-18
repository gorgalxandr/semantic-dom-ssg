#!/usr/bin/env node
/**
 * Verifies the built package before publishing: every path named in
 * package.json exists, each entry point loads from both ESM and CommonJS, the
 * built version matches package.json, and the CLI runs.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const require = createRequire(import.meta.url);
const failures = [];
const fail = (message) => failures.push(message);

function collectPaths(value, found = []) {
  if (typeof value === 'string') found.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectPaths(v, found));
  return found;
}

const paths = new Set([
  ...collectPaths(pkg.exports),
  ...collectPaths(pkg.bin),
  pkg.main,
  pkg.module,
  pkg.types,
]);
for (const path of paths) {
  if (!existsSync(new URL(`../${path}`, import.meta.url))) fail(`missing file: ${path}`);
}

// React is an optional peer; its entry is only checked for existence above.
const loadable = Object.keys(pkg.exports).filter((key) => !['./package.json', './react'].includes(key));
for (const key of loadable) {
  const specifier = key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`;
  const entry = pkg.exports[key];
  try {
    const esm = await import(specifier);
    if (Object.keys(esm).length === 0) fail(`${specifier} (import) has no exports`);
  } catch (error) {
    fail(`${specifier} (import) failed: ${error.message}`);
  }
  if (entry.require) {
    try {
      require(specifier);
    } catch (error) {
      fail(`${specifier} (require) failed: ${error.message}`);
    }
  }
}

try {
  const main = await import(pkg.name);
  if (main.VERSION !== pkg.version) fail(`VERSION is ${main.VERSION}, package.json says ${pkg.version}`);
} catch {
  // already reported above
}

try {
  const version = execFileSync(process.execPath, [pkg.bin['semantic-dom'], '--version'], {
    encoding: 'utf-8',
  }).trim();
  if (version !== pkg.version) fail(`CLI --version printed ${version}, expected ${pkg.version}`);
} catch (error) {
  fail(`CLI failed to run: ${error.message}`);
}

if (failures.length > 0) {
  console.error('Package check failed:');
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
console.log(`Package OK (${paths.size} files, ${loadable.length} entry points, version ${pkg.version})`);
