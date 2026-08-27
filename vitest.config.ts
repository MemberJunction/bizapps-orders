import { defineConfig } from 'vitest/config';

/**
 * Root vitest config, so `npx vitest run` means the same thing everywhere — locally and in CI.
 *
 * This file used to alias `@mj-biz-apps/accounting-engine-base` to a hand-written stub, because the
 * package was unpublished and lived in a sibling repository — present through a symlink in a
 * developer's checkout, absent on a CI runner. That made `registry-parity.test.ts` unrunnable in CI,
 * which is the wrong test to lose: it is the anti-vacuity floor that catches a check bundle silently
 * dropping out of the integration suite, and it has caught exactly that twice.
 *
 * `@mj-biz-apps/accounting-engine-base@0.1.0` is now published, so the premise is gone. The suite
 * runs against the real engine and passes, which also confirms what the stub's design implied: the
 * stub threw on every call rather than no-oping, so nothing was ever quietly running against it.
 */
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
});
