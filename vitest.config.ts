import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['typescript/src/**/*.test.ts', 'typescript/src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['typescript/src/**/*.ts'],
      exclude: ['typescript/src/**/*.test.ts', 'typescript/src/**/index.ts'],
    },
  },
});
