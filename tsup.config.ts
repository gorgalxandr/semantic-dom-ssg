import { defineConfig } from 'tsup';

export default defineConfig([
  // Main library entries (no shebang)
  {
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
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ['react', 'react-dom', 'jsdom'],
    esbuildOptions(options) {
      options.jsx = 'automatic';
    },
  },
  // CLI entry (with shebang)
  {
    entry: {
      cli: 'typescript/src/cli/index.ts',
    },
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    treeshake: true,
    minify: false,
    external: ['jsdom'],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
