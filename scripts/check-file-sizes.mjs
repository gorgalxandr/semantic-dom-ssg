#!/usr/bin/env node
/**
 * Fails when a hand-written source file exceeds the line limit.
 * Large files are a sign that a module is doing too much; split by responsibility.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const LIMIT = 500;
const SOURCE = /\.(ts|tsx|js|mjs|cjs|rs|py|sh|css|scss)$/;
const GENERATED = /(^|\/)(dist|node_modules|target|coverage|\.venv)\//;

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf-8',
})
  .split('\n')
  .filter((file) => SOURCE.test(file) && !GENERATED.test(file));

const offenders = [];
for (const file of files) {
  let lines;
  try {
    lines = readFileSync(file, 'utf-8').split('\n').length;
  } catch {
    continue; // deleted but still in the index
  }
  if (lines > LIMIT) offenders.push({ file, lines });
}

if (offenders.length > 0) {
  console.error(`Files over ${LIMIT} lines:`);
  for (const { file, lines } of offenders) console.error(`  ${lines}  ${file}`);
  process.exit(1);
}
console.log(`File sizes OK (${files.length} source files, limit ${LIMIT} lines)`);
