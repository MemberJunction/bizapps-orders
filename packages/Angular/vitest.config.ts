/**
 * Vitest config for @mj-biz-apps/orders-ng — TIER 1 only.
 *
 * Pure, no-DB, no-Angular-runtime unit tests over the EXTRACTED pure seams (the tier-1 boundary
 * doctrine in TEST-ARCHITECTURE): the order-editor draft rules and any other sync helper the
 * components delegate to.
 *
 * Replaces this package's `echo "No tests configured yet"` stub — a green stub is a vacuous pass,
 * which reads as coverage and is not.
 *
 * Rendering Angular components against a real in-process DB is TIER 4 and would need the analogjs
 * plugin + jsdom; it gets its own config when it lands, rather than slowing every tier-1 run.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.dom.test.ts'],
  },
});
