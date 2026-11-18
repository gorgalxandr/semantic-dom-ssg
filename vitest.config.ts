import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

export default defineConfig({
  define: { __PKG_VERSION__: JSON.stringify(pkg.version) },
  test: {
    globals: false,
    environment: 'jsdom',
    include: ['typescript/src/**/*.test.ts', 'typescript/src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['typescript/src/**/*.{ts,tsx}'],
      exclude: ['typescript/src/**/*.test.{ts,tsx}', 'typescript/src/core/types/**', 'typescript/src/cli/bin.ts'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
