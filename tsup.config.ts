import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

const shared = {
  dts: true,
  splitting: false,
  sourcemap: true,
  treeshake: true,
  minify: false,
  target: 'es2022',
  define: { __PKG_VERSION__: JSON.stringify(pkg.version) },
} as const;

export default defineConfig([
  // Library entries, usable from ESM and CommonJS
  {
    ...shared,
    entry: {
      index: 'typescript/src/index.ts',
      react: 'typescript/src/react/index.ts',
      vanilla: 'typescript/src/vanilla/index.ts',
      'eslint-plugin': 'typescript/src/eslint-plugin/index.ts',
      toon: 'typescript/src/toon/index.ts',
      mcp: 'typescript/src/mcp/index.ts',
      summary: 'typescript/src/summary/index.ts',
    },
    format: ['esm', 'cjs'],
    external: ['react', 'react-dom', 'jsdom', 'eslint'],
    esbuildOptions(options) {
      options.jsx = 'automatic';
    },
  },
  // CLI library (Node.js, ESM only)
  {
    ...shared,
    entry: { cli: 'typescript/src/cli/index.ts' },
    format: ['esm'],
    platform: 'node',
    external: ['jsdom'],
  },
  // CLI executable (with shebang)
  {
    ...shared,
    dts: false,
    entry: { bin: 'typescript/src/cli/bin.ts' },
    format: ['esm'],
    platform: 'node',
    external: ['jsdom'],
    banner: { js: '#!/usr/bin/env node' },
  },
]);
