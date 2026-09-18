/**
 * The test review 2 actually asked for, run against the real database.
 *
 *   "add one test through `OrderEntityServer`: save a header with a dirty line, not booking, with a
 *    refusing veto registered, and assert the save is refused with the veto's message. That is the
 *    test that would have caught this."
 *
 * The unit test added for that item drives `savePendingLines()` directly, through `Object.create`.
 * It proves the LOOP is scoped correctly, but it assumes the loop is reached. The premise the whole
 * review argument rests on is the routing above it:
 *
 *     if (!booking && !this.Lines.Dirty && this.IsSaved) { ...header-only shortcut... }
 *
 * A non-booking save with a DIRTY line must fall through to the full path and hit the loop. Nothing
 * pins that, and a unit test built on Object.create cannot: it never calls Save().
 *
 * This does. Real provider, real order graph, real header Save(), real veto.
 *
 * Writes a Draft order and deletes it again. Draft orders are deletable -- the immutability triggers
 * only bite once an order is booked, which this never does.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import sql from 'mssql';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(here, '../../MJ/.env'), quiet: true });

const FROZEN = 'This deal is closed. Reopen it to change what was sold.';

/**
 * Resolve the orders packages through `packages/Server`, which declares them, rather than from the
 * repo root, which does not link `@mj-biz-apps/*` at all. Same shape as `resolve-app-packages.mjs`
 * next door, and it does not depend on pnpm's node_modules layout staying put.
 */
const requireFromServer = createRequire(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'Server', 'package.json'),
);
const importFromServer = (specifier) =>
    import(pathToFileURL(requireFromServer.resolve(specifier)).href);

let failures = 0;
const check = (label, ok, detail) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -- ${detail}` : ''}`);
    if (!ok) failures++;
};

async function main() {
    const { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;
    const pool = await new sql.ConnectionPool({
        server: DB_HOST,
        port: Number(DB_PORT ?? 1433),
        database: DB_DATABASE,
        user: DB_USERNAME,
        password: DB_PASSWORD,
        options: { trustServerCertificate: true, encrypt: false },
        pool: { max: 6, min: 1 },
    }).connect();

    const { setupSQLServerClient, SQLServerProviderConfigData } = await import(
        '@memberjunction/sqlserver-dataprovider'
    );
    const { UserCache } = await import('@memberjunction/generic-database-provider');
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
    await UserCache.Instance.Refresh(pool);
    const user =
        UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];

    await importFromServer('@mj-biz-apps/orders-server');
    const { Metadata } = await import('@memberjunction/core');
    const { RegisterOrderLineEditVeto } = await importFromServer('@mj-biz-apps/orders-entities');
    const md = new Metadata();

    // Pick a PRODUCT first and take its company, so the two always agree. Companies live in
    // __mj, products in __mj_BizAppsOrders.
    const prod = (await pool.request().query(
        `SELECT TOP 1 ID, CompanyID FROM __mj_BizAppsOrders.vwProducts WHERE CompanyID IS NOT NULL ORDER BY __mj_CreatedAt`,
    )).recordset[0];
    if (!prod) throw new Error('no product with a company in this database');
    const productID = prod.ID;
    const companyID = prod.CompanyID;

    async function draftWithOneLine() {
        const order = await md.GetEntityObject('MJ_BizApps_Orders: Order Headers', user);
        order.NewRecord();
        order.OrderType = 'Sale';
        order.OrderDate = new Date();
        order.Status = 'Draft';
        order.CompanyID = companyID;
        const line = await md.GetEntityObject('MJ_BizApps_Orders: Order Lines', user);
        line.NewRecord();
        line.ProductID = productID;
        line.LineNumber = 1;
        line.Quantity = 1;
        // Add(), not assignment: `Lines` is a collection that stamps OrderHeaderID and tracks
        // Dirty/Removed. Assigning an array over it destroys exactly the state under test.
        order.Lines.Add(line);
        return order;
    }

    const created = [];
    try {
        // ── 1. baseline: with no veto registered, the graph save works ──────────────────────────
        RegisterOrderLineEditVeto(null);
        const ok = await draftWithOneLine();
        const okSaved = await ok.Save();
        check('a draft order with a line saves when nothing is registered', okSaved === true,
            okSaved ? ok.OrderNumber : (ok.LatestResult?.CompleteMessage ?? 'no message'));
        if (ok.ID) created.push(ok.ID);

        // ── 2. THE REVIEW'S TEST: header save, dirty line, NOT booking, refusing veto ───────────
        let asked = 0;
        RegisterOrderLineEditVeto({
            MayEdit: async (ctx) => {
                asked++;
                return ctx.Kind === 'delete' ? null : FROZEN;
            },
        });

        const frozen = await draftWithOneLine();
        let refusedMessage = null;
        let saved = null;
        try {
            saved = await frozen.Save();
            if (!saved) refusedMessage = frozen.LatestResult?.CompleteMessage ?? '(no message)';
        } catch (err) {
            refusedMessage = err?.message ?? String(err);
        }
        if (frozen.ID) created.push(frozen.ID);

        check('the whole-order path ASKS the veto when not booking', asked > 0, `asked ${asked}x`);
        check('the header save is refused', saved !== true, `Save() returned ${saved}`);
        check("the refusal carries the veto's own words",
            !!refusedMessage && refusedMessage.includes(FROZEN.slice(0, 30)),
            (refusedMessage ?? '').slice(0, 110));

        // ── 3. and the routing premise itself: a dirty line is what makes the loop reachable ────
        check('Lines.Dirty was true, so Save() did not take the header-only shortcut',
            frozen.Lines?.Dirty === true, `Lines.Dirty = ${frozen.Lines?.Dirty}`);
    } finally {
        RegisterOrderLineEditVeto(null);
        for (const id of created) {
            try {
                // Price components first: a line that saved has them, and they hold the FK that
                // makes a bare line delete fail. Draft orders are deletable; booked ones are not,
                // and this never books one.
                await pool.request().query(
                    `SET QUOTED_IDENTIFIER ON;
                     DELETE FROM __mj_BizAppsOrders.OrderLinePriceComponent
                       WHERE OrderLineID IN (SELECT ID FROM __mj_BizAppsOrders.OrderLine WHERE OrderHeaderID = '${id}');
                     DELETE FROM __mj_BizAppsOrders.OrderLine WHERE OrderHeaderID = '${id}';
                     DELETE FROM __mj_BizAppsOrders.OrderHeader WHERE ID = '${id}';`,
                );
            } catch (e) {
                console.log(`  (cleanup note for ${id}: ${e.message.split('\n')[0]})`);
            }
        }
        const left = (await pool.request().query(
            `SELECT COUNT(*) AS n FROM __mj_BizAppsOrders.OrderHeader WHERE ID IN ('${created.join("','")}')`,
        )).recordset[0].n;
        check('fixtures cleaned up', left === 0, `${left} left`);
        await pool.close();
    }

    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error('live veto check failed to set up:', e?.message ?? e);
    process.exit(1);
});
