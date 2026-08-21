import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Root vitest config, so `npx vitest run` means the same thing everywhere — locally and in CI.
 *
 * THE ALIAS IS THE POINT OF THIS FILE. `@mj-biz-apps/accounting-engine-base` lives in a SIBLING
 * REPOSITORY and is resolved through a symlink in a developer's checkout. On a CI runner it does not
 * exist, and `npm ci` cannot fetch it — it is unpublished. That made `registry-parity.test.ts`
 * unrunnable in CI, which is the wrong test to lose: it is the guard that catches a check bundle
 * silently dropping out of the integration suite, and it has caught exactly that twice.
 *
 * The parity test never calls into accounting. It imports the check modules to count them, and those
 * import `fixture.ts`, which imports the engine for one call inside `CreateOrdersFixture` — a
 * function that only runs against a real database. So the dependency is in the module graph and
 * nowhere in the behaviour, and stubbing it makes an already-independent test provably independent.
 *
 * See `packages/IntegrationTests/src/__tests__/stubs/accounting-engine-base.ts` for what the stub
 * does and, more importantly, when it would become dishonest.
 */
const stub = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
    test: {
        include: ['packages/*/src/**/*.test.ts'],
        // Each package's tests are independent and none of them touch a database, so there is no
        // ordering requirement to preserve here.
        passWithNoTests: false,
        server: {
            deps: {
                // Every BizApps `*-ng` package is `"type": "module"` but ngc emits extensionless
                // relative specifiers (`./lib/generated/generated-forms.module`), which Node's ESM
                // resolver rejects. Bundlers resolve them, which is why the Angular build is fine
                // and only the Node-side test runner trips. Inlining these routes them through
                // Vite's resolver instead of externalizing them to Node, so the real modules stay
                // in the graph -- nothing is stubbed or mocked away.
                inline: [/@mj-biz-apps[\\/][^\\/]+-ng[\\/]/],
            },
        },
    },
    resolve: {
        alias: {
            '@mj-biz-apps/accounting-engine-base': stub(
                './packages/IntegrationTests/src/__tests__/stubs/accounting-engine-base.ts',
            ),
        },
    },
});
