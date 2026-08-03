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
import * as entityNames from '../entity-names.js';
import {
    ALL_ENTITY_NAMES,
    GL_ACCOUNT_LINK_ENTITY,
    ORDER_HEADER_ENTITY,
    PERSON_ENTITY,
    RELATIONSHIP_ENTITY,
} from '../entity-names.js';

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
import '../checks/tax.checks.js';
import '../checks/composition.checks.js';
import '../checks/returns.checks.js';
import '../checks/gift-cards.checks.js';
import '../checks/bundles.checks.js';
import '../checks/fulfillment.checks.js';
import '../checks/capture-payment.checks.js';
import '../checks/invoicing.checks.js';
import '../checks/order-status.checks.js';
import '../checks/create-in-state.checks.js';
import '../checks/arithmetic-edges.checks.js';
import '../checks/concurrency.checks.js';
import '../checks/volume.checks.js';
import '../checks/entitlements.checks.js';
import '../checks/payment-providers.checks.js';
import '../checks/ach-settlement.checks.js';

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
    'order-booking': 10,
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
    tax: 15,
    composition: 10,
    returns: 12,
    'gift-cards': 12,
    bundles: 12,
    fulfillment: 12,
    'capture-payment': 12,
    'create-in-state': 12,
    invoicing: 15,
    'order-status': 8,
    'arithmetic-edges': 12,
    concurrency: 6,
    volume: 13,
    entitlements: 15,
    'payment-providers': 12,
    'ach-settlement': 17,
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
        // READ THE DIRECTORY, not a hand-written list. This was `['ORD-01' … 'ORD-08']`, frozen at
        // the eight bundles that existed when it was written — and ORD-09, ORD-10 and ORD-16 were
        // each added later with a Test record that never joined the suite. `mj test suite` ran, went
        // green, and dispatched neither intercompany, events, nor composition.
        //
        // That is the same failure this whole file exists to prevent, one level up: a list somebody
        // has to remember to extend is a list that eventually stops matching reality.
        const suite = read('metadata-tests/test-suites/.orders-integration-suite.json');
        const testsDir = resolve(repoRoot, 'metadata-tests/tests');
        const names = readdirSync(testsDir)
            .filter((f) => f.endsWith('.json') && f !== '.mj-sync.json')
            .map((f) => JSON.parse(read(`metadata-tests/tests/${f}`)).fields.Name as string);

        expect(names.length, 'there are Test records to check').toBeGreaterThan(0);
        for (const name of names) {
            expect(
                suite,
                `'${name}' has a Test record but is not a member of the suite — 'mj test suite' ` +
                    `would go green having never dispatched it`,
            ).toContain(`Tests.Name=${name}`);
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
/**
 * The sequence counter, asserted against the SOURCE — because no runtime check can reach it.
 *
 * The `concurrency` bundle holds the counter row on a second connection and watches a confirm block
 * on it. That proves serialization, and mutation testing showed it proves nothing more: strip
 * `WITH (UPDLOCK, HOLDLOCK)` and it still passes (the bare UPDATE takes the same exclusive lock),
 * and rewrite it as a dirty read plus a separate UPDATE — the classic lost-update race — and it
 * still passes, because it blocks on the second statement instead of the first.
 *
 * The interleaving that actually breaks a non-atomic counter is both sessions reading before either
 * writes, and that cannot be forced from a test that holds an exclusive lock throughout. So the
 * property is pinned where it can be: the number must be taken in ONE statement that reads and
 * writes together.
 */
describe('the document-number counter is taken atomically', () => {
    const source = () => read('packages/CoreEntitiesServer/src/OrderEntityServer.ts');

    it('uses a single UPDATE … OUTPUT rather than a SELECT followed by an UPDATE', () => {
        const fn = source().slice(source().indexOf('private async nextSequence'));
        const body = fn.slice(0, fn.indexOf('\n    }'));

        expect(body, 'the counter is read and written by one UPDATE … OUTPUT').toMatch(
            /UPDATE[\s\S]*OUTPUT\s+deleted\.NextSequenceNumber/,
        );
        expect(
            /SELECT\s+@\w+\s*=/.test(body),
            'reading the counter into a variable and updating it separately is the lost-update race: ' +
                'two sessions read the same value and both take it',
        ).toBe(false);
        expect(
            /READUNCOMMITTED|NOLOCK/i.test(body),
            'a dirty read of the counter defeats the point of taking it under lock',
        ).toBe(false);
    });

    it('takes the number inside the CALLER transaction, so a rollback releases it', () => {
        // A counter incremented in its own transaction would survive a failed confirm and leave a
        // permanent hole in the invoice sequence. `concurrency.CN3` asserts the behaviour; this
        // asserts nobody has quietly introduced a separate transaction to "make it safer".
        const fn = source().slice(source().indexOf('private async nextSequence'));
        const body = fn.slice(0, fn.indexOf('\n    }'));
        expect(/BeginTransaction|BEGIN\s+TRAN/i.test(body), 'no transaction of its own').toBe(false);
    });
});

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

describe('entity names are stated once and used everywhere', () => {
    // WHY THIS EXISTS. Entity names resolve at RUNTIME. A typo compiles, type-checks, and then
    // `RunView` returns an empty result — indistinguishable from a table that is genuinely empty.
    // The UX agent lost an entire live run to exactly this: a dashboard asked for `Orders` and
    // `Payments` when the entities are `Order Headers` and `Payment Headers`, and every tile
    // rendered a healthy-looking 0 and $0.00. Unit tests and mockups all passed straight over it.
    //
    // The DATABASE half of the claim is checked by the integration suite, which cannot create a row
    // through an entity that does not exist. What is asserted here is the half that needs no
    // database: that the names live in one module, and that check files do not reintroduce literals.

    it('declares no entity-name literals outside entity-names.ts', () => {
        const checksDir = resolve(dirname(fileURLToPath(import.meta.url)), '../checks');
        const offenders: string[] = [];
        for (const file of readdirSync(checksDir).filter((f) => f.endsWith('.checks.ts'))) {
            // Strip comments first. A comment that DISCUSSES an entity name is documentation, not a
            // call site, and flagging it would push people to describe names vaguely — the opposite
            // of what this test is for. Only a literal in executable code is an offence.
            const body = readFileSync(resolve(checksDir, file), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
            // A quoted string shaped like an MJ entity name: "<Prefix>: <Entity Name>".
            for (const m of body.matchAll(/["'`](MJ[._][A-Za-z._]*[A-Za-z]:\s[^"'`]+)["'`]/g)) {
                offenders.push(`${file}: ${m[1]}`);
            }
        }
        expect(
            offenders,
            'entity names belong in entity-names.ts, where a typo is wrong once instead of ' +
                `silently wrong in fifteen places. Found: ${offenders.join(', ')}`,
        ).toEqual([]);
    });

    it('keeps the Common prefix on DOTS, not underscores', () => {
        // Orders and Accounting are `MJ_BizApps_Orders:` / `MJ_BizApps_Accounting:`; Common is
        // `MJ.BizApps.Common:`. It reads like a typo every single time, so it is asserted here to
        // stop somebody "fixing" it into a runtime failure that surfaces as an empty grid.
        expect(PERSON_ENTITY).toBe('MJ.BizApps.Common: People');
        expect(RELATIONSHIP_ENTITY).toBe('MJ.BizApps.Common: Relationships');
        expect(ORDER_HEADER_ENTITY).toBe('MJ_BizApps_Orders: Order Headers');
        expect(GL_ACCOUNT_LINK_ENTITY).toBe('MJ_BizApps_Accounting: GL Account Links');
    });

    it('lists every exported name in ALL_ENTITY_NAMES', () => {
        // ALL_ENTITY_NAMES is what the integration fixture can iterate to prove each name resolves.
        // A name exported but missing from the list is one nothing ever validates.
        const exported = Object.entries(entityNames)
            .filter(([k, v]) => k.endsWith('_ENTITY') && typeof v === 'string')
            .map(([, v]) => v as string);
        const missing = exported.filter((n) => !ALL_ENTITY_NAMES.includes(n));
        expect(missing, `add these to ALL_ENTITY_NAMES: ${missing.join(', ')}`).toEqual([]);
    });

    it('has no duplicate names', () => {
        const seen = new Map<string, number>();
        for (const n of ALL_ENTITY_NAMES) seen.set(n, (seen.get(n) ?? 0) + 1);
        const dupes = [...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n);
        expect(dupes, `duplicated in ALL_ENTITY_NAMES: ${dupes.join(', ')}`).toEqual([]);
    });
});
