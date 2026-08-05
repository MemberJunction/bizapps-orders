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
import { openSync, closeSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
import sql from 'mssql';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env'), quiet: true });

/**
 * ONE RUN AT A TIME, ENFORCED.
 *
 * Two concurrent runs fight over `OrderSequence`, which every confirm takes under
 * UPDLOCK/HOLDLOCK to mint a gap-free order number. The loser times out at 15s and the failure
 * surfaces as `Error executing SQL` on confirm — which reads exactly like a broken engine. It cost
 * an hour of chasing nine phantom defects that were really one lock.
 *
 * The lock is CORRECT; the contention proves it works. What is wrong is finding out this way, so a
 * second run is refused up front with the reason rather than allowed to produce a misleading
 * result. A stale lock from a killed run is detected by checking whether the recorded pid is still
 * alive, so a crash does not require manual cleanup.
 */
const LOCK = path.resolve(here, '.integration.lock');

function acquireLock() {
    try {
        // 'wx' fails if the file exists — the atomic part.
        closeSync(openSync(LOCK, 'wx'));
    } catch {
        let holder = null;
        try {
            holder = JSON.parse(readFileSync(LOCK, 'utf8'));
        } catch {
            // Unreadable lock: treat as stale rather than deadlocking on a corrupt file.
        }
        const alive = holder?.pid != null && isRunning(holder.pid);
        if (alive) {
            console.error(
                `\n  Another integration run is already going (pid ${holder.pid}, started ${holder.startedAt}).\n` +
                `  Refusing to start a second one.\n\n` +
                `  Two runs contend for the OrderSequence lock that every confirm takes, and the loser\n` +
                `  times out reporting 'Error executing SQL' — which looks like a broken engine rather\n` +
                `  than contention. Wait for the other run, or kill pid ${holder.pid}.\n`,
            );
            process.exit(2);
        }
        console.warn(`  Clearing a stale lock from pid ${holder?.pid ?? 'unknown'} (no longer running).`);
        try { unlinkSync(LOCK); } catch { /* raced with another cleanup; the write below settles it */ }
        closeSync(openSync(LOCK, 'w'));
    }
    writeFileSync(LOCK, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
}

function isRunning(pid) {
    try {
        // Signal 0 checks for existence without touching the process.
        process.kill(pid, 0);
        return true;
    } catch (e) {
        // EPERM means it exists but belongs to somebody else — still running.
        return e?.code === 'EPERM';
    }
}

function releaseLock() {
    try { unlinkSync(LOCK); } catch { /* already gone */ }
}

acquireLock();
// Released however this ends — a normal finish, a thrown error, or Ctrl-C.
process.on('exit', releaseLock);
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { releaseLock(); process.exit(130); });
}

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
    'pricing',
    'promotions',
    'charges',
    'tax',
    'composition',
    'returns',
    'gift-cards',
    'bundles',
    'fulfillment',
    'capture-payment',
    'create-in-state',
    'invoicing',
    'arithmetic-edges',
    'concurrency',
    'events',
    'line-subscriber',
    // Last on purpose: it is the slowest bundle by an order of magnitude (hundreds of confirms), so
    // a failure anywhere else surfaces before the run settles in to build populations.
    'entitlements',
    'payment-providers',
    'ach-settlement',
    'volume',
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
                // The nested part, for the same reason the bundle-setup path below prints it:
                // mssql puts the useful text ('Invalid column name X', 'The DELETE statement
                // conflicted with …') in `originalError`, and the first line of the outer message
                // is the useless 'Error executing SQL'. Without this a failing check says only
                // that SQL failed, which is indistinguishable from a broken engine and sends the
                // reader bisecting. The setup path already learned this; the check path had not.
                for (const key of ['originalError', 'precedingErrors']) {
                    const nested = e?.[key];
                    if (!nested) continue;
                    for (const n of Array.isArray(nested) ? nested : [nested]) {
                        console.log(`      ↳ ${n?.message ?? n}`);
                        if (n?.originalError?.message) console.log(`        ↳ ${n.originalError.message}`);
                    }
                }
            }
        }
    } catch (e) {
        // A Setup failure fails the bundle, not the run — the remaining bundles still get a chance.
        fail++;
        failures.push({ Id: `${bundle}.<setup>`, message: String(e?.message ?? e), stack: e?.stack });
        // Print the WHOLE thing. A setup failure kills every check in the bundle, and mssql puts
        // the useful part ('Invalid column name X') in nested properties rather than the first line
        // of the message — truncating it turns a two-minute fix into a bisect.
        console.log(`  ✖ bundle setup failed: ${String(e?.message ?? e)}`);
        for (const key of ['originalError', 'precedingErrors']) {
            const nested = e?.[key];
            if (!nested) continue;
            for (const n of Array.isArray(nested) ? nested : [nested]) {
                console.log(`      ↳ ${n?.message ?? n}`);
                if (n?.originalError?.message) console.log(`        ↳ ${n.originalError.message}`);
            }
        }
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
