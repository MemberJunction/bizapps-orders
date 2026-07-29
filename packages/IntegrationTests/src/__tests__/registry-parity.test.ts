/**
 * Drift guards for the check registry (integration-testing-plan §5).
 *
 * A bundle's name lives in FOUR places — the check IDs, `src/index.ts`, the standalone dispatcher's
 * `ALL_BUNDLES`, and a `MJ: Tests` record's `Configuration.checks[].type`. Miss one and you get a
 * bundle that nothing dispatches: no error, no failure, just silently absent coverage. These tests
 * are cheap and catch exactly that.
 *
 * They are also the anti-vacuity floor for the suite itself. `mj test` reports a green suite when it
 * runs ZERO checks — so "the suite passed" is only meaningful if something independently asserts
 * that the checks still exist.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';

// The CHECK modules only — deliberately not `../index.js`, which also imports the server bootstrap
// packages to register the code under test. Those pull in @memberjunction/server's config loader and
// would need a full server environment for what is a pure wiring test. `index.ts` is verified by
// reading it instead, below.
import '../checks/order-booking.checks.js';
import '../checks/revenue-recognition.checks.js';
import '../checks/subscriptions.checks.js';
import '../checks/subscription-cancellation.checks.js';
import '../checks/subscription-renewal.checks.js';
import '../checks/payments-rollups.checks.js';
import '../checks/payment-ledger.checks.js';
import '../checks/intercompany.checks.js';
import '../checks/events.checks.js';
import '../checks/line-subscriber.checks.js';
import '../checks/account-credit.checks.js';
import '../checks/pricing.checks.js';
import '../checks/promotions.checks.js';
import '../checks/charges.checks.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const registry = IntegrationCheckRegistry.Instance;

/**
 * The expected shape of the suite, stated independently of the code that builds it.
 *
 * Counts are deliberately EXACT. A range would let a silently deleted check slide, which is the
 * failure this file exists to catch — if you add or remove a check, updating this table is the
 * moment you confirm the metadata and the dispatcher know about it too.
 */
const EXPECTED_BUNDLES: Record<string, number> = {
    'order-booking': 9,
    'revenue-recognition': 7,
    subscriptions: 12,
    'subscription-cancellation': 10,
    'subscription-renewal': 11,
    'payments-rollups': 9,
    'payment-ledger': 12,
    intercompany: 12,
    events: 10,
    'line-subscriber': 12,
    'account-credit': 11,
    pricing: 16,
    promotions: 19,
    charges: 12,
};

/**
 * Bundles the FRAMEWORK registers on the same shared registry, not ours.
 * `@memberjunction/testing-integration`'s entry point imports its own `self-test` check as a side
 * effect, so it appears here the moment the package is loaded. Listing it explicitly keeps the
 * "no more, no fewer" assertion honest — filtering by prefix would hide a stray bundle of ours.
 */
const FRAMEWORK_BUNDLES = new Set(['self-test']);

/** The bundles this package contributes. */
const ourBundles = () => registry.GetBundleNames().filter((b) => !FRAMEWORK_BUNDLES.has(b));

const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf8');

describe('every bundle is registered with the expected checks', () => {
    it('registers exactly the expected bundles — no more, no fewer', () => {
        expect(ourBundles().sort()).toEqual(Object.keys(EXPECTED_BUNDLES).sort());
    });

    for (const [bundle, count] of Object.entries(EXPECTED_BUNDLES)) {
        it(`${bundle} has ${count} checks, each uniquely identified and named`, () => {
            const checks = registry.GetBundle(bundle);
            expect(checks).toHaveLength(count);

            // A duplicate Id silently REPLACES the earlier check in the registry, so the count
            // above would still pass while a check quietly vanished.
            expect(new Set(checks.map((c) => c.Id)).size).toBe(count);

            for (const check of checks) {
                expect(check.Id.startsWith(`${bundle}.`), `${check.Id} is namespaced`).toBe(true);
                expect(check.Name.length, `${check.Id} has a descriptive name`).toBeGreaterThan(10);
                expect(typeof check.Fn).toBe('function');
                // Every check here writes to the database; one that isn't gated would run in a
                // read-only tier and mutate it.
                expect(check.RequiresMutation, `${check.Id} is mutation-gated`).toBe(true);
            }
        });

        it(`${bundle} has a lifecycle that builds its fixture`, () => {
            const lifecycle = registry.GetLifecycle(bundle);
            expect(lifecycle, `${bundle} registers Setup/Teardown`).toBeDefined();
            expect(typeof lifecycle!.Setup).toBe('function');
            expect(typeof lifecycle!.Teardown).toBe('function');
        });
    }
});

describe('the bundle name agrees everywhere it is written down', () => {
    it('the standalone dispatcher runs every registered bundle', () => {
        // Without this, `node test-harnesses/integration.mjs` silently skips a new bundle and the
        // inner loop stops matching what CI runs.
        const dispatcher = read('test-harnesses/integration.mjs');
        const listed = dispatcher.slice(dispatcher.indexOf('ALL_BUNDLES'), dispatcher.indexOf('const args'));
        for (const bundle of ourBundles()) {
            expect(listed, `ALL_BUNDLES includes '${bundle}'`).toContain(`'${bundle}'`);
        }
    });

    it('every registered bundle has a MJ: Tests record naming it', () => {
        // Without this, `mj test suite` never dispatches the bundle — the suite goes green having
        // run strictly less than it appears to.
        // Read the DIRECTORY, not a hand-maintained list. This was a concatenation of ten explicit
        // reads, and adding an eleventh bundle meant remembering to extend it — which is the same
        // failure mode the assertion is trying to prevent, one level up.
        const testsDir = resolve(repoRoot, 'metadata-tests/tests');
        const tests = readdirSync(testsDir)
            .filter((f) => f.endsWith('.json') && f !== '.mj-sync.json')
            .map((f) => read(`metadata-tests/tests/${f}`))
            .join('\n');
        for (const bundle of ourBundles()) {
            expect(tests, `a Test record declares '${bundle}'`).toContain(`"type": "${bundle}"`);
        }
    });

    it('every Test record is a member of the suite', () => {
        const suite = read('metadata-tests/test-suites/.orders-integration-suite.json');
        for (const name of ['ORD-01', 'ORD-02', 'ORD-03', 'ORD-04', 'ORD-05', 'ORD-06', 'ORD-07', 'ORD-08']) {
            expect(suite, `${name} is in the suite`).toContain(name);
        }
    });

    it('index.ts exports every bundle, so importing the package registers them all', () => {
        // `mj test` imports ONLY this package's entry point. A bundle file that exists but is not
        // re-exported never registers, and the driver reports "unknown bundle" at run time.
        const index = read('packages/IntegrationTests/src/index.ts');
        for (const bundle of ourBundles()) {
            expect(index, `index.ts exports the '${bundle}' checks`).toContain(`${bundle}.checks.js`);
        }
    });

    it('index.ts registers the server packages the checks exercise', () => {
        // Without these the ClassFactory never sees OrderEntityServer, every confirm runs against
        // the plain generated entity, and checks that expect a REJECTION pass having proved nothing.
        const index = read('packages/IntegrationTests/src/index.ts');
        expect(index).toContain('@mj-biz-apps/orders-server');
        expect(index).toContain('@mj-biz-apps/accounting-server');
    });

    it('mj.config.cjs points the testing framework at this package', () => {
        const config = read('mj.config.cjs');
        expect(config).toContain('@mj-biz-apps/orders-integration-tests');
        expect(config).toContain('checkModules');
    });
});

/**
 * The completeness check this file was missing.
 *
 * Everything above compares the registry against `EXPECTED_BUNDLES` — but the registry only holds
 * what this file explicitly imports, so a BRAND-NEW bundle was invisible to all of it. Adding
 * `account-credit` proved that in the worst way: the suite stayed green while a whole bundle went
 * unlisted, which is precisely the drift these tests exist to catch.
 *
 * So compare against the filesystem, which cannot be forgotten the way an import can.
 */
describe('no check file escapes this test', () => {
    it('imports every *.checks.ts in the checks directory', () => {
        const checksDir = resolve(dirname(fileURLToPath(import.meta.url)), '../checks');
        const onDisk = readdirSync(checksDir)
            .filter((f) => f.endsWith('.checks.ts'))
            .map((f) => f.replace(/\.ts$/, '.js'))
            .sort();
        const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
        for (const file of onDisk) {
            expect(
                self,
                `registry-parity.test.ts must import '../checks/${file}' — a bundle nobody imports is a ` +
                    `bundle nobody verifies, and the rest of this file would stay green without it`,
            ).toContain(`import '../checks/${file}';`);
        }
    });
});
