/**
 * Vitest config for @mj-biz-apps/orders-core-entities-server.
 *
 * ISOLATED, no-DB unit tests ONLY (MJ convention: no database connections in unit tests;
 * keep them deterministic and < 5s). Live, DB-backed validation (real caches + the order →
 * JE → batch flow against a real instance) lives in the tsx harnesses under
 * `<app-root>/test-harnesses/`, NOT here.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
