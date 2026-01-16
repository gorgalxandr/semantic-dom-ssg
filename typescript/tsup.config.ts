import { defineConfig } from 'tsup';

export default defineConfig([
  // Main library entries (no shebang)
  {
    entry: {
      index: 'src/index.ts',
      react: 'src/react/index.ts',
      vanilla: 'src/vanilla/index.ts',
      'eslint-plugin': 'src/eslint-plugin/index.ts',
      toon: 'src/toon/index.ts',
      mcp: 'src/mcp/index.ts',
      summary: 'src/summary/index.ts',
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
      cli: 'src/cli/index.ts',
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
