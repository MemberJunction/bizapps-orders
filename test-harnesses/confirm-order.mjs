/**
 * One-off QA helper: confirm an order through the entity layer so the real confirm transaction runs
 * (booking, subscriptions, entitlements, accounting), rather than faking Status in SQL.
 *
 * Usage: ORDER_ID=<uuid> node confirm-order.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sql from 'mssql';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env'), quiet: true });

const orderID = process.env.ORDER_ID;
if (!orderID) throw new Error('ORDER_ID is required');

async function main() {
    const { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;
    const pool = await new sql.ConnectionPool({
        server: DB_HOST,
        port: Number(DB_PORT ?? 1433),
        database: DB_DATABASE,
        user: DB_USERNAME,
        password: DB_PASSWORD,
        options: { trustServerCertificate: true, encrypt: false },
        pool: { max: 5, min: 1 },
    }).connect();

    const { setupSQLServerClient, SQLServerProviderConfigData } = await import('@memberjunction/sqlserver-dataprovider');
    const { UserCache } = await import('@memberjunction/generic-database-provider');
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
    await UserCache.Instance.Refresh(pool);
    const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];

    // Register the generated entity classes of EVERY app whose rows this touches. Without them MJ
    // falls back to plain BaseEntity, every typed field reads undefined, and the accounting engine
    // silently resolves no GL account links — which looks exactly like a missing configuration.
    (await import('@mj-biz-apps/accounting-entities')).LoadGeneratedEntities?.();
    (await import('@mj-biz-apps/common-entities')).LoadGeneratedEntities?.();
    // …and accounting's SERVER classes, which register Accounting.CreateJournalEntries. Confirming an
    // order books through it, so without this the confirm fails inside the accounting call.
    (await import('@mj-biz-apps/accounting-server')).LoadBizAppsAccountingServer?.();
    const ordersServer = await import('@mj-biz-apps/orders-server');
    ordersServer.LoadBizAppsOrdersServer?.();

    const { Metadata, CompositeKey } = await import('@memberjunction/core');
    const provider = Metadata.Provider;

    const order = await provider.GetEntityObject('MJ_BizApps_Orders: Order Headers', user);
    if (!(await order.InnerLoad(CompositeKey.FromID(orderID)))) throw new Error(`No order ${orderID}`);
    console.log(`Loaded ${order.OrderNumber}: status=${order.Status} gross=${order.TotalGross} class=${order.constructor.name}`);

    if (order.Status === 'Confirmed') {
        console.log('Already Confirmed — nothing to do.');
    } else {
        order.Status = 'Confirmed';
        const ok = await order.Save();
        console.log(ok ? `SAVED — status now ${order.Status}, confirmedAt=${order.ConfirmedAt}` : `SAVE FAILED: ${order.LatestResult?.Message}`);
        if (!ok) {
            for (const e of order.LatestResult?.Errors ?? []) console.log('  error:', JSON.stringify(e));
        }
    }
    await pool.close();
}

main().catch((e) => {
    console.error('confirm-order failed:', e);
    process.exit(1);
});
