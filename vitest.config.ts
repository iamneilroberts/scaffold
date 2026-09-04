import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolve @scaffold/core straight to its TS source in-repo (see the
    // "development" exports condition in packages/core/package.json), so
    // tests don't depend on a prior `npm run build`.
    conditions: ['development'],
  },
  test: {
    include: ['packages/**/*.test.ts', 'examples/**/*.test.ts'],
  },
});
