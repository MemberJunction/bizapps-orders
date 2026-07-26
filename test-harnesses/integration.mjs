/**
 * Standalone dispatcher for the integration suite.
 *
 * Resolves bundles from the SAME `IntegrationCheckRegistry` that `mj test` uses, so there is no
 * drift between the two execution paths — this script is the fast inner loop (no metadata push, no
 * driver, a stack trace on failure), and `mj test suite --name "BizApps Orders Integration"` is the
 * one that runs in CI and records results.
 *
 * Usage:
 *   node test-harnesses/integration.mjs                 # every bundle
 *   node test-harnesses/integration.mjs subscriptions   # one or more bundles
 *   node test-harnesses/integration.mjs subscriptions.SB5   # a single check
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sql from 'mssql';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env'), quiet: true });

/** Bundles in dependency-free order — each owns its own fixture, so order is presentational. */
const ALL_BUNDLES = [
    'order-booking',
    'revenue-recognition',
    'subscriptions',
    'subscription-cancellation',
    'subscription-renewal',
    'payments-rollups',
    'payment-ledger',
    'intercompany',
    'account-credit',
    'events',
    'line-subscriber',
];

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('-'));

const { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;
const pool = await new sql.ConnectionPool({
    server: DB_HOST,
    port: Number(DB_PORT ?? 1433),
    database: DB_DATABASE,
    user: DB_USERNAME,
    password: DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: false },
    pool: { max: 10, min: 1 },
}).connect();

const { setupSQLServerClient, SQLServerProviderConfigData, UserCache } = await import(
    '@memberjunction/sqlserver-dataprovider'
);
const provider = await setupSQLServerClient(
    new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'),
);
await UserCache.Instance.Refresh(pool);
const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
if (!user) throw new Error('No context user in UserCache.');

// Both apps' server classes: orders' entity subclasses do the booking, accounting's remote
// operation writes the ledger. Without both, the checks would exercise generated stubs.
await import('@mj-biz-apps/accounting-server').then((m) => m.LoadBizAppsAccountingServer?.());
await import('@mj-biz-apps/orders-server').then((m) => m.LoadBizAppsOrdersServer?.());

const { IntegrationCheckRegistry } = await import('@memberjunction/testing-integration');
await import('@mj-biz-apps/orders-integration-tests'); // side effect: registers the bundles

const registry = IntegrationCheckRegistry.Instance;

/**
 * The context the checks receive. `Storage` is only read by MJ's own cache bundles, so a stub is
 * honest here — ours never touch it, and fabricating a real instrumented cache would mean claiming
 * to own the process for no benefit.
 */
const baseContext = {
    User: user,
    Provider: provider,
    Pool: pool,
    Schema: process.env.MJ_CORE_SCHEMA || '__mj',
    Storage: undefined,
};

const requested = only.length ? only : ALL_BUNDLES;
let pass = 0;
let fail = 0;
const failures = [];

for (const request of requested) {
    const [bundle, localId] = request.includes('.') ? request.split('.') : [request, null];
    const checks = registry.GetBundle(bundle).filter((c) => !localId || c.Id === request);
    if (checks.length === 0) {
        console.error(`\n✖ no checks matched '${request}' — known bundles: ${registry.GetBundleNames().join(', ')}`);
        fail++;
        continue;
    }

    console.log(`\n=== ${bundle} (${checks.length} check${checks.length === 1 ? '' : 's'}) ===`);
    const ctx = { ...baseContext };
    const lifecycle = registry.GetLifecycle(bundle);

    try {
        if (lifecycle) await lifecycle.Setup(ctx);

        for (const check of checks) {
            const started = Date.now();
            try {
                await check.Fn(ctx);
                pass++;
                console.log(`  ✔ ${check.Name}  (${Date.now() - started}ms)`);
            } catch (e) {
                fail++;
                const message = String(e?.message ?? e).split('\n')[0];
                failures.push({ Id: check.Id, message, stack: e?.stack });
                console.log(`  ✖ ${check.Name}\n      ${message}`);
            }
        }
    } catch (e) {
        // A Setup failure fails the bundle, not the run — the remaining bundles still get a chance.
        fail++;
        failures.push({ Id: `${bundle}.<setup>`, message: String(e?.message ?? e), stack: e?.stack });
        console.log(`  ✖ bundle setup failed: ${String(e?.message ?? e).split('\n')[0]}`);
    } finally {
        // Guaranteed even on a mid-Setup crash, exactly as the driver does it.
        if (lifecycle) await lifecycle.Teardown(ctx).catch((e) => console.warn(`  teardown warn: ${e?.message}`));
    }
}

if (failures.length && process.env.IT_VERBOSE) {
    console.log('\n=== stacks ===');
    for (const f of failures) console.log(`\n--- ${f.Id} ---\n${f.stack}`);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
await pool.close();
process.exit(fail === 0 ? 0 : 1);
