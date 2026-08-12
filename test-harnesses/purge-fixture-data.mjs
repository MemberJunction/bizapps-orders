#!/usr/bin/env node
/**
 * Delete every fixture run's data from the database.
 *
 * The integration checks roll back, so they leave nothing — but the FIXTURE is committed (it is
 * reference data every check reads), and so is anything `seed-review-data.mjs` writes. Each run
 * mints its own companies, so those accumulate.
 *
 * That accumulation is not merely untidy. The fixture resolves GL accounts BY CODE, so leftover
 * companies from an earlier run can be matched by a later one, and checks that assert on a
 * company's balance then read someone else's. Housekeeping, but load-bearing.
 *
 * Usage:  node test-harnesses/purge-fixture-data.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sql from 'mssql';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env'), quiet: true });

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

const { setupSQLServerClient, SQLServerProviderConfigData } = await import(
    '@memberjunction/sqlserver-dataprovider'
);
// UserCache moved packages in MJ #3734 (no re-export left behind).
const { UserCache } = await import('@memberjunction/generic-database-provider');
const provider = await setupSQLServerClient(
    new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'),
);
await UserCache.Instance.Refresh(pool);
const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];

const { PurgeAllFixtureData } = await import('@mj-biz-apps/orders-integration-tests');

const purged = await PurgeAllFixtureData({
    User: user,
    Provider: provider,
    Pool: pool,
    Schema: process.env.MJ_CORE_SCHEMA || '__mj',
    Storage: undefined,
});

const left = await pool
    .request()
    .query(`SELECT COUNT(*) AS N FROM __mj_BizAppsOrders.OrderHeader`);

console.log(`\nPurged ${purged} fixture companies. Orders remaining: ${left.recordset[0].N}\n`);
await pool.close();
process.exit(0);
