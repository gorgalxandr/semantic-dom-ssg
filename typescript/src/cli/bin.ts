/**
 * Executable entry point for the `semantic-dom` command.
 * Kept separate from index.ts so importing `semantic-dom-ssg/cli` has no side effects.
 */

import { run } from './index.js';

void run();
