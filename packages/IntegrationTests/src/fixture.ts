/**
 * fixture.ts — the shared catalog every orders bundle books against, plus the transaction
 * discipline that makes the suite re-runnable.
 *
 * ISOLATION MODEL (integration-testing-plan §2, validated by the Phase 0 probe)
 * ----------------------------------------------------------------------------
 * MJ's own suite uses prefix-and-sweep teardown because its client-transport bundles have no
 * transaction surface. Every check we care about is SERVER transport, so that constraint doesn't
 * bind us and we take the stronger option:
 *
 *   - The FIXTURE (companies, GL accounts + links, product catalog) is created ONCE per bundle and
 *     COMMITTED. It is inert reference data — nothing books against it until a check runs.
 *   - Every MUTATING check runs inside its own provider transaction and ROLLS BACK. Orders, journal
 *     entries, payments and subscription terms never reach disk, so teardown never has to fight the
 *     immutability triggers or the cross-app FKs. The booking path opens its own transaction and
 *     accounting's CreateJournalEntries opens another inside that; the probe confirmed the resulting
 *     3-deep savepoint nesting commits and rolls back correctly.
 *   - Teardown is therefore a plain FK-ordered sweep of the fixture. No `DISABLE TRIGGER`, and a
 *     mid-run crash leaves nothing but the catalog rows.
 *
 * THE ONE RULE THAT FOLLOWS: **every query goes through the provider** ({@link TxQuery}), never
 * through `ctx.Pool`. Two independent reasons, either sufficient:
 *   1. The pool is a DIFFERENT connection. Under READ COMMITTED it BLOCKS on an open check
 *      transaction's write locks until the request times out — the probe hung 15s on exactly that.
 *   2. `ctx.Pool` is only populated when the driver owned the bootstrap. Under `mj test` the CLI
 *      installs the instrumented cache first, so it arrives undefined.
 *
 * CONNECTS TO:
 *   TABLES: __mj.Company, __mj_BizAppsAccounting.{GLAccount,GLAccountLink,AccountingCompanyProfile},
 *           __mj_BizAppsOrders.{ProductType,ProductCategory,Product}
 *   USED BY: every bundle under ./checks
 */
import { randomUUID } from 'node:crypto';
import { BaseEntity, Metadata, RunView } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { Assert, type IntegrationCheckContext } from '@memberjunction/testing-integration';
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';

export const ORDERS_SCHEMA = '__mj_BizAppsOrders';
export const ACCT_SCHEMA = '__mj_BizAppsAccounting';
export const COMMON_SCHEMA = '__mj_BizAppsCommon';

/** Stamped on every fixture row so a stranded run is identifiable and sweepable by name. */
export const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_ENTITLEMENT_ENTITY = 'MJ_BizApps_Orders: Product Entitlements';
const EVENT_PRODUCT_ENTITY = 'MJ_BizApps_Orders: Event Products';
const PRODUCT_PRICE_ENTITY = 'MJ_BizApps_Orders: Product Prices';
const PROMOTION_ENTITY = 'MJ_BizApps_Orders: Promotions';
const PROMOTION_CODE_ENTITY = 'MJ_BizApps_Orders: Promotion Codes';
const PROMOTION_TARGET_ENTITY = 'MJ_BizApps_Orders: Promotion Targets';

const FIXTURE_TAG = '(bizapps-orders integration test — safe to delete)';

/** The GL account shape each fixture company gets. Codes mirror accounting's starter chart. */
const FIXTURE_ACCOUNTS = [
    { Key: 'AR', Code: '11201', Name: 'Accounts Receivable', Type: 'Asset' },
    { Key: 'Sales', Code: '40100', Name: 'Sales Revenue', Type: 'Revenue' },
    { Key: 'Deferred', Code: '21301', Name: 'Deferred Revenue', Type: 'Liability' },
    // Cash is a BASELINE requirement, not a payments-only nicety: once capture books
    // `Dr Cash / Cr AR` (D18), any order carrying an initial payment fails to confirm without it.
    // That is correct — you cannot book cash with no cash account — but it makes the Cash link part
    // of the minimum setup for using the feature at all.
    { Key: 'Cash', Code: '10100', Name: 'Cash — Operating', Type: 'Asset' },
    // Charges book to their OWN accounts (D71) — shipping is revenue, tax is a liability you owe a
    // jurisdiction. Both resolve through GLAccountLink on the charge TYPE, so the role name used to
    // link them is a lookup key rather than a claim about what the account is.
    { Key: 'Shipping', Code: '40200', Name: 'Shipping Revenue', Type: 'Revenue' },
    { Key: 'TaxPayable', Code: '21500', Name: 'Sales Tax Payable', Type: 'Liability' },
] as const;

export interface FixtureCompany {
    ID: string;
    Name: string;
    /** GL account IDs by role key. */
    Accounts: Record<string, string>;
}

export interface OrdersFixture {
    /** Per-run marker, e.g. `IT-ORD-M3K9Z`. Every fixture row's Name starts with it. */
    Run: string;
    CurrencyCode: string;
    /** `__mj.Company` entity ID — GLAccountLink is polymorphic and needs it. */
    CompanyEntityID: string;
    /** Fully linked: AR + Sales + Deferred. Deliberately NO 'Sales Discounts' link, so the D11 net-into-sales fallback is exercised. */
    CoA: FixtureCompany;
    /** Second linked company — proves per-line company resolution on a multi-company order (D10). */
    CoB: FixtureCompany;
    /** Has GL accounts but NO links at all — the unresolvable case that must roll the whole confirm back (D12). */
    CoC: FixtureCompany;
    /**
     * REAL US tax geography (D73). Seeded HERE, in the integration fixture, and deliberately NOT in
     * `metadata/` — these are test facts, not application seed data, and shipping a US rate table
     * with the app would be a maintenance promise nobody made (Amith 2026-07-28).
     *
     * The set is chosen to exercise the four shapes that actually occur:
     *   - COUNTY VARIATION inside one state: Santa Clara 9.125% vs San Mateo 9.375%
     *   - a FLAT state with no locals: Maryland 6%, DC 6%
     *   - a REGIONAL add-on: Northern Virginia 6% vs 5.3% elsewhere
     *   - CITY + DISTRICT layering: NYC is state 4% + city 4.5% + MCTD 0.375%
     * Rates are approximate and dated; they are here to prove resolution, not to file returns.
     */
    Tax: {
        /** TaxJurisdiction IDs by short key. */
        JurisdictionIDs: Map<string, string>;
        /** Ship-to Address IDs by short key — the input to jurisdiction matching. */
        AddressIDs: Map<string, string>;
    };
    /** RevenueRecognitionType IDs by Code. */
    RevRecTypeIDs: Map<string, string>;
    /** SubscriptionType IDs by Code. */
    SubscriptionTypeIDs: Map<string, string>;
    /** PaymentType IDs by Code. */
    PaymentTypeIDs: Map<string, string>;
    ProductTypeIDs: { Simple: string; Subscription: string; Event: string };
    /** The event a ticket product is for — its dates drive the line's service period (D-EVENT). */
    Event: { StartsAt: Date; EndsAt: Date };
    /**
     * Who buys. Subscriptions are scoped to a subscriber, and `SubscriberScope` on the type decides
     * WHICH of these is legal — so we need both an organization and an individual to prove the
     * organization-only type rejects a person and the Either types accept both.
     */
    Customers: { OrganizationID: string; SecondOrganizationID: string; PersonID: string };
    /** Products by mnemonic — see {@link CreateOrdersFixture} for what each one is for. */
    Products: Record<string, string>;
    /**
     * `ProductEntitlement` template IDs by mnemonic (D27/D76). Chosen to cover all four validity
     * modes and both quantity shapes, because the modes are where the interesting behaviour is:
     * a perpetual download, a term-scoped seat count, an event window, and a fixed duration.
     */
    Entitlements: Record<string, string>;
}

// ─── Fixture handoff ───────────────────────────────────────────────────────────────────────────
//
// `IntegrationCheckContext` is a CLOSED interface owned by @memberjunction/testing-integration —
// it enumerates MJ's own bundle fixtures as named optional fields, so an external adopter has no
// slot to assign to. We keep ours in a module-scoped holder instead. That is safe here for the same
// reason MJ's own model is: the driver runs one bundle at a time in a dedicated, short-lived
// process, and Setup → checks → Teardown is strictly serial.

let currentFixture: OrdersFixture | undefined;

/** The fixture for the running bundle. Throws when Setup didn't run — a wiring bug, not a test failure. */
export function Fx(): OrdersFixture {
    Assert(currentFixture != null, 'orders fixture missing — the bundle lifecycle Setup did not run');
    return currentFixture!;
}

// ─── SQL helpers ───────────────────────────────────────────────────────────────────────────────

/**
 * Query on the PROVIDER's connection — the one a check's transaction lives on. Use this for every
 * read and write inside a check. See the header: `ctx.Pool` would block on the transaction's locks.
 */
export async function TxQuery<T = Record<string, unknown>>(
    ctx: IntegrationCheckContext,
    query: string,
): Promise<T[]> {
    const provider = ctx.Provider as unknown as { ExecuteSQL(q: string): Promise<unknown> };
    const rows = await provider.ExecuteSQL(query);
    return (Array.isArray(rows) ? rows : []) as T[];
}

/** The single row a query is expected to return; throws with the query when it returns none. */
export async function TxOne<T = Record<string, unknown>>(
    ctx: IntegrationCheckContext,
    query: string,
): Promise<T> {
    const rows = await TxQuery<T>(ctx, query);
    Assert(rows.length > 0, `expected a row from: ${query}`);
    return rows[0];
}

/**
 * Compare two GUIDs. SQL Server returns `UNIQUEIDENTIFIER` uppercased while `randomUUID()` produces
 * lowercase, so a bare `===` between a fixture ID and a queried one is always false — a trap that
 * silently turns a real assertion into one that can never pass.
 */
export function SameID(a: string | null | undefined, b: string | null | undefined): boolean {
    return a != null && b != null && a.toLowerCase() === b.toLowerCase();
}

/** Normalized GUID for set membership and sorting. */
export const NormID = (v: string) => v.toLowerCase();

/**
 * Fixture setup/teardown query. Same connection as {@link TxQuery} — the distinct name marks
 * INTENT: these run with no check transaction open, and the rows they write are COMMITTED.
 *
 * Deliberately NOT `ctx.Pool`. The driver only populates that field when it owned the bootstrap
 * itself; on the `mj test` path the CLI installs the instrumented cache first, so `Pool` arrives
 * undefined and a pool-based fixture fails at setup with a message that sounds like a platform
 * problem ("SQL-Server-only") when it is really a transport-plumbing difference. The provider is
 * present on every path, so routing through it makes the suite work identically under `mj test`
 * and under the standalone dispatcher.
 */
async function PoolQuery<T = Record<string, unknown>>(
    ctx: IntegrationCheckContext,
    query: string,
): Promise<T[]> {
    return TxQuery<T>(ctx, query);
}

const provider = (ctx: IntegrationCheckContext) =>
    ctx.Provider as unknown as IMetadataProvider & {
        BeginTransaction(): Promise<void>;
        RollbackTransaction(): Promise<void>;
    };

/**
 * Run `body` inside a transaction that ALWAYS rolls back — the isolation primitive every mutating
 * check is written against.
 *
 * A check that fails still rolls back (the rollback is in `finally`), so one failure never poisons
 * the checks after it. The body's own error propagates so the driver reports the real failure and
 * not a teardown artifact.
 */
export async function InRolledBackTransaction(
    ctx: IntegrationCheckContext,
    body: () => Promise<void>,
): Promise<void> {
    const p = provider(ctx);
    await p.BeginTransaction();
    try {
        await body();
    } finally {
        try {
            await p.RollbackTransaction();
        } catch (e) {
            // "Transaction has been aborted" means SQL Server already rolled it back — a
            // severity-16 error inside a trigger dooms the whole transaction, savepoints included,
            // so by the time we ask, there is nothing left to roll back. Isolation still held.
            // What does NOT hold is the provider's depth counter: RollbackTransaction throws before
            // clearing it, so the next check's BeginTransaction would nest a savepoint onto a dead
            // transaction and cascade failures through the rest of the bundle. Reset it.
            const aborted = /transaction has been aborted|no active transaction/i.test(
                String((e as Error).message),
            );
            if (!aborted) throw e;
            resetTransactionState(p);
        }
    }
}

/**
 * Clear the provider's transaction bookkeeping after SQL Server killed the transaction underneath
 * it. Reaching into private state is not something to do lightly — it is here because the provider
 * has no public recovery path for a server-side abort, and the alternative is one doomed transaction
 * poisoning every check after it. Prefer {@link OutsideTransaction} for checks that EXPECT to
 * trigger a database guard; this is the safety net, not the plan.
 */
function resetTransactionState(p: unknown): void {
    const internals = p as { _transaction?: unknown; _transactionDepth?: number; _savepointStack?: unknown[] };
    internals._transaction = null;
    internals._transactionDepth = 0;
    internals._savepointStack = [];
}

/**
 * Run a check WITHOUT the shared transaction, cleaning up explicitly afterwards.
 *
 * For checks whose whole point is to trip a database guard. A trigger that raises a severity-16
 * error dooms its enclosing transaction — that is correct behaviour and exactly what we want to
 * prove — but it makes rollback-based isolation impossible for that check. `cleanup` runs in a
 * `finally` and is best-effort, so a failed assertion still tidies up.
 */
export async function OutsideTransaction(
    body: () => Promise<void>,
    cleanup: () => Promise<void>,
): Promise<void> {
    try {
        await body();
    } finally {
        await cleanup().catch((e) => console.warn(`      cleanup warn: ${(e as Error).message}`));
    }
}

// ─── Setup ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Build the shared catalog. Committed, because it is inert reference data — every check that books
 * against it does so inside a transaction that rolls back.
 *
 * Companies are seeded directly rather than through `AccountingCompanyProfile`'s auto-seeding COA
 * save: booking depends only on Company + GLAccount + GLAccountLink, so the minimal fixture keeps
 * these checks about the ORDERS path rather than accounting's own setup flow.
 */
export async function CreateOrdersFixture(ctx: IntegrationCheckContext): Promise<OrdersFixture> {
    const run = `IT-ORD-${randomUUID().slice(0, 8).toUpperCase()}`;
    const md = new Metadata();
    const rv = new RunView();

    const currency = await rv.RunView<{ Code: string }>(
        { EntityName: 'MJ_BizApps_Accounting: Currencies', Fields: ['Code'], MaxRows: 1, ResultType: 'simple' },
        ctx.User,
    );
    const currencyCode = currency.Results?.[0]?.Code;
    Assert(
        currencyCode != null,
        'no currencies in __mj_BizAppsAccounting — push the accounting app metadata before running this suite',
    );

    const companyEntity = md.Entities.find((e) => e.Name === 'MJ: Companies');
    Assert(companyEntity != null, "entity 'MJ: Companies' not found — is MJ core metadata loaded?");

    const roleRows = await PoolQuery<{ ID: string; Name: string }>(
        ctx,
        `SELECT ID, Name FROM ${ACCT_SCHEMA}.GLAccountRole`,
    );
    const roleID = new Map(roleRows.map((r) => [r.Name, r.ID]));

    const fixture: OrdersFixture = {
        Run: run,
        CurrencyCode: currencyCode!,
        CompanyEntityID: companyEntity!.ID,
        CoA: await createCompany(ctx, run, 'Co A', currencyCode!),
        CoB: await createCompany(ctx, run, 'Co B', currencyCode!),
        CoC: await createCompany(ctx, run, 'Co C (unlinked)', currencyCode!),
        RevRecTypeIDs: await codeMap(ctx, `${ORDERS_SCHEMA}.RevenueRecognitionType`),
        SubscriptionTypeIDs: await codeMap(ctx, `${ORDERS_SCHEMA}.SubscriptionType`),
        PaymentTypeIDs: await codeMap(ctx, `${ORDERS_SCHEMA}.PaymentType`),
        ProductTypeIDs: { Simple: '', Subscription: '', Event: '' },
        // A FUTURE, fixed event window. Fixed rather than relative so a recognition date can be
        // asserted exactly; future so the deferral is real rather than already-earned.
        Event: { StartsAt: new Date('2027-04-15T09:00:00Z'), EndsAt: new Date('2027-04-17T17:00:00Z') },
        Customers: { OrganizationID: '', SecondOrganizationID: '', PersonID: '' },
        Products: {},
        Entitlements: {},
        // Populated below, once the jurisdictions and addresses exist.
        Tax: { JurisdictionIDs: new Map(), AddressIDs: new Map() },
    };

    fixture.Customers = {
        OrganizationID: await createOrganization(ctx, run, 'Buyer Org'),
        SecondOrganizationID: await createOrganization(ctx, run, 'Other Org'),
        PersonID: await createPerson(ctx, run),
    };

    // Company-level GL links (D12: defaults start at the company level). CoC gets none — that is
    // the point of CoC, and the reason `product-c` must roll a confirm back.
    for (const co of [fixture.CoA, fixture.CoB]) {
        for (const [role, key] of [
            ['Accounts Receivable', 'AR'],
            ['Sales', 'Sales'],
            ['Deferred Revenue', 'Deferred'],
            ['Cash', 'Cash'],
        ] as const) {
            const rid = roleID.get(role);
            Assert(rid != null, `GL account role '${role}' missing — push accounting metadata first`);
            await PoolQuery(
                ctx,
                `INSERT INTO ${ACCT_SCHEMA}.GLAccountLink (ID, GLAccountID, GLAccountRoleID, EntityID, RecordID, Status)
                 VALUES ('${randomUUID()}','${co.Accounts[key]}','${rid}','${fixture.CompanyEntityID}','${co.ID}','Active')`,
            );
        }
    }

    // CHARGE-TYPE GL links (D71). These belong in the FIXTURE rather than in a check, because
    // `AccountingEngineBase` caches links in-process and is refreshed once here — a link inserted
    // inside a check's rolled-back transaction is invisible to the cache, so the charge would refuse
    // to book for a reason that has nothing to do with what the check is testing.
    const chargeTypeEntityRows = await PoolQuery<{ ID: string }>(
        ctx,
        `SELECT ID FROM __mj.Entity WHERE Name = 'MJ_BizApps_Orders: Charge Types'`,
    );
    const chargeTypeEntityID = chargeTypeEntityRows[0]?.ID;
    if (chargeTypeEntityID) {
        // CLEAR ANY PRE-EXISTING ONES FIRST. Every other link this fixture writes is scoped to a
        // company it just created, so it cannot collide with anything. These are the exception: they
        // are keyed by CHARGE TYPE, which is application metadata shared by every run. A leftover set
        // — from an interrupted run, or from `seed-review-data.mjs`, which commits deliberately —
        // leaves TWO active links per charge type, and resolution can then post this run's shipping
        // and tax to another run's accounts.
        //
        // That is not theoretical: it is what made composition's CX8 report a stranded receivable of
        // 2,902.59 belonging to a company the test had never heard of. Deleting first also makes
        // setup idempotent, which it was not.
        await PoolQuery(
            ctx,
            `DELETE FROM ${ACCT_SCHEMA}.GLAccountLink WHERE EntityID = '${chargeTypeEntityID}'`,
        );
        const salesRoleID = roleID.get('Sales');
        for (const co of [fixture.CoA, fixture.CoB]) {
            for (const [code, key] of [
                ['Shipping', 'Shipping'],
                ['Handling', 'Shipping'],
                ['SalesTax', 'TaxPayable'],
                ['VAT', 'TaxPayable'],
            ] as const) {
                const ctRows = await PoolQuery<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.ChargeType WHERE Code = '${code}'`,
                );
                const ctID = ctRows[0]?.ID;
                if (!ctID) continue;
                await PoolQuery(
                    ctx,
                    `INSERT INTO ${ACCT_SCHEMA}.GLAccountLink (ID, GLAccountID, GLAccountRoleID, EntityID, RecordID, Status)
                     VALUES ('${randomUUID()}','${co.Accounts[key]}','${salesRoleID}','${chargeTypeEntityID}','${ctID}','Active')`,
                );
            }
        }
    }

    // ── REAL US TAX GEOGRAPHY (D73) ───────────────────────────────────────────
    // Layered on purpose: a jurisdiction row matches on the fields it SPECIFIES, so a state row
    // (RegionCode only) and a county row (RegionCode + postal range) both match a Santa Clara
    // address and produce TWO charges. That is how real US sales tax works and it is why tax is
    // modelled as a charge rather than as one number.
    const authorityID = randomUUID();
    await PoolQuery(
        ctx,
        `INSERT INTO ${ACCT_SCHEMA}.TaxAuthority (ID, Code, Name, CountryCode, IsActive)
         VALUES ('${authorityID}', '${run}-US', '${run} US Tax Authorities', 'US', 1)`,
    );

    // key, code, name, region, postalFrom, postalTo, city, rate  (rate is the LAYER, not the total)
    const JURISDICTIONS: Array<[string, string, string, string | null, string | null, string | null, string | null, number]> = [
        // California: 7.25% statewide, then district taxes by county. Neighbouring counties differ
        // by a quarter point, which is the whole argument for resolving below state level.
        ['CA',            'CA-STATE',      'California',             'CA', null,    null,    null, 0.0725],
        ['CA-SANTACLARA', 'CA-SCL',        'Santa Clara County',     'CA', '95000', '95199', null, 0.01875],
        ['CA-SANMATEO',   'CA-SMT',        'San Mateo County',       'CA', '94000', '94499', null, 0.02125],
        // Flat states — one layer, no locals.
        ['DC',            'DC-STATE',      'District of Columbia',   'DC', null,    null,    null, 0.06],
        ['MD',            'MD-STATE',      'Maryland',               'MD', null,    null,    null, 0.06],
        // Virginia: 5.3% base, Northern Virginia adds 0.7%.
        ['VA',            'VA-STATE',      'Virginia',               'VA', null,    null,    null, 0.053],
        ['VA-NOVA',       'VA-NOVA',       'Northern Virginia',      'VA', '22000', '22299', null, 0.007],
        // New York: state + city + a transit district, three separate layers.
        ['NY',            'NY-STATE',      'New York',               'NY', null,    null,    null, 0.04],
        ['NY-NYC',        'NY-NYC',        'New York City',          'NY', '10001', '10299', null, 0.045],
        ['NY-MCTD',       'NY-MCTD',       'Metropolitan Commuter Transportation District', 'NY', '10001', '10299', null, 0.00375],
    ];

    for (const [key, code, name, region, from, to, city, rate] of JURISDICTIONS) {
        const jid = randomUUID();
        fixture.Tax.JurisdictionIDs.set(key, jid);
        const q = (v: string | null) => (v == null ? 'NULL' : `'${v}'`);
        await PoolQuery(
            ctx,
            `INSERT INTO ${ACCT_SCHEMA}.TaxJurisdiction
               (ID, TaxAuthorityID, Code, Name, CountryCode, RegionCode, PostalCodeStart, PostalCodeEnd, CityName, IsActive)
             VALUES ('${jid}','${authorityID}','${run}-${code}','${run} ${name}','US',${q(region)},${q(from)},${q(to)},${q(city)},1)`,
        );
        // Standard rate for every jurisdiction.
        await PoolQuery(
            ctx,
            `INSERT INTO ${ACCT_SCHEMA}.TaxRate (ID, TaxJurisdictionID, TaxCategory, Rate, EffectiveFrom, Source)
             VALUES ('${randomUUID()}','${jid}','Standard',${rate},'2020-01-01','Manual')`,
        );
    }

    // A CATEGORY-SPECIFIC rate: Maryland zero-rates the 'Reduced' category while taxing everything
    // else at 6%. Proves the resolver picks the product's own category over the Standard fallback —
    // a distinction worth three-fold errors when it is wrong.
    //
    // 'Reduced' rather than a name like 'Publications' because accounting's CK_TaxRate_Category
    // enumerates exactly five values in DDL. That is too narrow for real product taxability —
    // groceries, prescription drugs, digital goods, clothing and publications are each taxed
    // differently in different states — and it is the same shape as the Source enum that was
    // dropped for the same reason. Marcelo has offered to promote it to a first-class lookup; until
    // then the fixture speaks the vocabulary that exists.
    await PoolQuery(
        ctx,
        `INSERT INTO ${ACCT_SCHEMA}.TaxRate (ID, TaxJurisdictionID, TaxCategory, Rate, EffectiveFrom, Source)
         VALUES ('${randomUUID()}','${fixture.Tax.JurisdictionIDs.get('MD')}','Reduced',0.0,'2020-01-01','Manual')`,
    );

    // Ship-to addresses, one per jurisdiction shape.
    const ADDRESSES: Array<[string, string, string, string, string]> = [
        ['SantaClara', '1 Innovation Way', 'San Jose',      'CA', '95110'],
        ['SanMateo',   '2 Peninsula Ave',  'San Mateo',     'CA', '94401'],
        ['DC',         '3 Capitol St',     'Washington',    'DC', '20001'],
        ['Maryland',   '4 Bay Rd',         'Annapolis',     'MD', '21401'],
        ['NoVA',       '5 Beltway Dr',     'Arlington',     'VA', '22201'],
        ['Richmond',   '6 James River Rd', 'Richmond',      'VA', '23219'],
        ['NYC',        '7 Broadway',       'New York',      'NY', '10013'],
    ];
    for (const [key, line1, city, state, zip] of ADDRESSES) {
        const aid = randomUUID();
        fixture.Tax.AddressIDs.set(key, aid);
        await PoolQuery(
            ctx,
            `INSERT INTO ${COMMON_SCHEMA}.Address (ID, Line1, City, StateProvince, PostalCode, Country)
             VALUES ('${aid}','${line1}','${city}','${state}','${zip}','US')`,
        );
    }

    // NEXUS: CoA collects in California, DC and Maryland — and deliberately NOT in New York or
    // Virginia. Without a gap there is no way to prove the commonest reason a correct system
    // charges nothing: we have no obligation there.
    for (const key of ['CA', 'CA-SANTACLARA', 'CA-SANMATEO', 'DC', 'MD']) {
        await PoolQuery(
            ctx,
            `INSERT INTO ${ACCT_SCHEMA}.CompanyTaxNexus
               (ID, CompanyID, TaxJurisdictionID, NexusType, RegistrationNumber, RegisteredFrom, Status)
             VALUES ('${randomUUID()}','${fixture.CoA.ID}','${fixture.Tax.JurisdictionIDs.get(key)}',
                     'Economic','${run}-REG','2020-01-01','Active')`,
        );
    }

    Assert(fixture.RevRecTypeIDs.size >= 3, 'revenue recognition types missing — push the orders app metadata');
    Assert(fixture.SubscriptionTypeIDs.size >= 4, 'subscription types missing — push the orders app metadata');

    const rr = (code: string) => {
        const id = fixture.RevRecTypeIDs.get(code);
        Assert(id != null, `RevenueRecognitionType '${code}' not found`);
        return id!;
    };

    fixture.ProductTypeIDs.Simple = await createProductType(ctx, run, 'Service');
    // A SUBSCRIPTION type's grants follow the TERM, not the order date (D76). Seeding this here rather
    // than per product is what makes the walk's terminating answer the right one for the whole type.
    fixture.ProductTypeIDs.Subscription = await createProductType(ctx, run, 'Subscription', {
        DefaultEntitlementValidityMode: 'SubscriptionTerm',
    });
    // The extension pointers are what make this type an EVENT type rather than a label: they name
    // the IsA children that carry event data (BO-D37).
    fixture.ProductTypeIDs.Event = await createProductType(ctx, run, 'Event', {
        ProductExtensionEntity: 'MJ_BizApps_Orders: Event Products',
        OrderLineExtensionEntity: 'MJ_BizApps_Orders: Event Order Lines',
        DefaultRevenueRecognitionTypeID: rr('AllBackEnd'),
        // A ticket grants access for the length of the EVENT, whenever the ticket was bought.
        DefaultEntitlementValidityMode: 'EventWindow',
    });

    const catA = await createCategory(ctx, run, fixture.CoA.ID, 'Cat A');
    const catB = await createCategory(ctx, run, fixture.CoB.ID, 'Cat B');
    const catC = await createCategory(ctx, run, fixture.CoC.ID, 'Cat C');

    const st = (code: string) => {
        const id = fixture.SubscriptionTypeIDs.get(code);
        Assert(id != null, `SubscriptionType '${code}' not found`);
        return id!;
    };

    fixture.Products = {
        /** Co A, UpFront, no subscription — the plain revenue line. */
        WidgetA: await createProduct(ctx, run, fixture.CoA.ID, fixture.ProductTypeIDs.Simple, catA, 'Widget A', rr('UpFront')),
        /** Co B, UpFront — same shape in the second company, for multi-company orders. */
        WidgetB: await createProduct(ctx, run, fixture.CoB.ID, fixture.ProductTypeIDs.Simple, catB, 'Widget B', rr('UpFront')),
        /** Co C, UpFront, but CoC has NO GL links — every confirm containing it must roll back whole. */
        WidgetC: await createProduct(ctx, run, fixture.CoC.ID, fixture.ProductTypeIDs.Simple, catC, 'Widget C', rr('UpFront')),
        /** Deferred until the end date, no subscription — an EVENT. Proves deferred rev-rec without a term. */
        EventA: await createProduct(ctx, run, fixture.CoA.ID, fixture.ProductTypeIDs.Subscription, catA, 'Event A', rr('AllBackEnd')),
        /** Straight-line over the service period, no subscription — recognition anchored to the ORDER LINE. */
        DeferredA: await createProduct(ctx, run, fixture.CoA.ID, fixture.ProductTypeIDs.Subscription, catA, 'Deferred A', rr('EvenOverTime')),
        /** Annual rolling, monthly recognition — term starts the day it is bought; repeat purchase EXTENDS. */
        SubRolling: await createProduct(ctx, run, fixture.CoA.ID, fixture.ProductTypeIDs.Subscription, catA, 'Sub Rolling', rr('EvenOverTime'), st('AnnualRolling')),
        /** Jan-1 anchored with PRORATION — the anchor + partial-period path. */
        SubCalendar: await createProduct(ctx, run, fixture.CoA.ID, fixture.ProductTypeIDs.Subscription, catA, 'Sub Calendar', rr('EvenOverTime'), st('CalendarYear')),
        /** Jul-1 anchored, ChargeFull, QUARTERLY recognition, RejectDuplicate — the opposite corner of every axis. */
        SubFiscal: await createProduct(ctx, run, fixture.CoA.ID, fixture.ProductTypeIDs.Subscription, catA, 'Sub Fiscal', rr('EvenOverTime'), st('FiscalYearJul')),
        /** A SEAT: the org holds and pays, a named person benefits (D62 NamedIndividual). */
        SubSeat: await createProduct(ctx, run, fixture.CoA.ID, fixture.ProductTypeIDs.Subscription, catA, 'Sub Seat', rr('EvenOverTime'), st('CorporateSeat')),
        /** Monthly rolling subscription — the short-cadence case. */
        SubMonthly: await createProduct(ctx, run, fixture.CoA.ID, fixture.ProductTypeIDs.Subscription, catA, 'Sub Monthly', rr('EvenOverTime'), st('MonthlyRolling')),
        /**
         * A REAL event ticket: an Event-typed product with an `EventProduct` extension row carrying
         * the event dates. Unlike `EventA` above — which only borrows the AllBackEnd rev-rec rule and
         * needs its service period hand-set — this one has the dates on the EVENT, so the order line
         * needs none (D-EVENT).
         */
        EventTicket: await createProduct(ctx, run, fixture.CoA.ID, fixture.ProductTypeIDs.Event, catA, 'Conference Ticket', rr('AllBackEnd')),
        /** A second ticket to the same event, owned by Co B — events crossing companies. */
        EventTicketB: await createProduct(ctx, run, fixture.CoB.ID, fixture.ProductTypeIDs.Event, catB, 'Conference Ticket B', rr('AllBackEnd')),
    };

    // The IsA extension rows. PK = the SAME UUID as the parent Product (BO-D37), which is what
    // makes `WHERE ID = <productID>` on Event Products the "is this product an event?" test.
    for (const ticket of [fixture.Products.EventTicket, fixture.Products.EventTicketB]) {
        // THE ONE CATALOG ROW THAT STAYS RAW SQL, and not for convenience.
        //
        // An IsA child takes its PARENT's id as its own primary key (BO-D37) — that identity IS the
        // relationship. `BaseEntity` cannot express that: `NewRecord()` then setting the PK makes the
        // save take the update path, which matches no row, and it returns false with no message, no
        // `CompleteMessage` and an empty `Errors` array. Verified directly against a real product, not
        // inferred. Every other catalog row in this fixture goes through the object model.
        //
        // Worth fixing upstream — creating an extension row is a legitimate thing an application does,
        // and today it can only be done with SQL.
        await PoolQuery(
            ctx,
            `INSERT INTO ${ORDERS_SCHEMA}.EventProduct
                (ID, EventStartsAt, EventEndsAt, VenueName, Capacity, RequiresAttendeeInfo)
             VALUES ('${ticket}','${fixture.Event.StartsAt.toISOString()}','${fixture.Event.EndsAt.toISOString()}',
                     '${run} Convention Center', 500, 1)`,
        );

    }

    // ── ENTITLEMENT TEMPLATES (D27/D76) ───────────────────────────────────────
    // One per validity mode, because the modes are where the behaviour lives. Note that WidgetA
    // carries TWO templates with DIFFERENT windows — the case a policy resolved purely from the
    // product could not express, and the reason ValidityMode sits on the template.
    fixture.Entitlements = {
        /** Uncountable, perpetual: the shape of a digital download or a lifetime feature flag. */
        WidgetSupport: await addEntitlement(ctx, fixture.Products.WidgetA, {
            Code: 'WIDGET-SUPPORT',
            EntitlementType: 'Feature',
            ValidityMode: 'Perpetual',
        }),
        /** Countable, and time-boxed independently of its sibling above. */
        WidgetForum: await addEntitlement(ctx, fixture.Products.WidgetA, {
            Code: 'WIDGET-FORUM',
            EntitlementType: 'ResourceQuantity',
            Quantity: 5,
            UnitOfMeasure: 'Seat',
            ValidityMode: 'FixedDuration',
            ValidityDurationDays: 90,
        }),
        /** Follows the TERM, so a cancelled year revokes one grant and leaves the rest of history. */
        SubSeats: await addEntitlement(ctx, fixture.Products.SubRolling, {
            Code: 'SUB-SEATS',
            EntitlementType: 'ResourceQuantity',
            Quantity: 3,
            UnitOfMeasure: 'Seat',
            ValidityMode: 'SubscriptionTerm',
        }),
        /** Opens an hour early and closes a day late — the online-event case. */
        TicketAccess: await addEntitlement(ctx, fixture.Products.EventTicket, {
            Code: 'TICKET-ACCESS',
            EntitlementType: 'AccessLevel',
            ValidityMode: 'EventWindow',
            AccessLeadHours: 1,
            AccessLagHours: 24,
        }),
        /**
         * On the PRORATING product, so a fractional line quantity reaches the quantity rule. That is
         * where round-up actually matters: a half-year of a 4-seat product is 2.33 seats, and handing
         * the customer two is a support ticket while handing them three is nothing.
         */
        ProratedSeats: await addEntitlement(ctx, fixture.Products.SubCalendar, {
            Code: 'PRORATED-SEATS',
            EntitlementType: 'ResourceQuantity',
            Quantity: 4,
            UnitOfMeasure: 'Seat',
            ValidityMode: 'SubscriptionTerm',
        }),
        /** Deliberately SILENT on validity, so the product/category/type walk has to answer. */
        DeferredAccess: await addEntitlement(ctx, fixture.Products.DeferredA, {
            Code: 'DEFERRED-ACCESS',
            EntitlementType: 'Feature',
            ValidityMode: null,
        }),
    };


    // The GL links we just wrote are invisible to booking until the accounting engine reloads.
    // `AccountingEngineBase` is a BaseEngine: it caches accounts, roles and links in-process on
    // first use, which is right for production (links change rarely) and fatal for a suite that
    // creates a NEW company per bundle. Without this, bundle 1 passes — its fixture existed before
    // the lazy first load — and every bundle after it fails with "no GL account is linked",
    // pointing at the app when the fault is entirely the test harness's.
    await AccountingEngineBase.Instance.Config(true, ctx.User, ctx.Provider);

    currentFixture = fixture;
    return fixture;
}

async function codeMap(ctx: IntegrationCheckContext, table: string): Promise<Map<string, string>> {
    const rows = await PoolQuery<{ ID: string; Code: string }>(ctx, `SELECT ID, Code FROM ${table}`);
    return new Map(rows.map((r) => [r.Code, r.ID]));
}

async function createCompany(
    ctx: IntegrationCheckContext,
    run: string,
    label: string,
    currencyCode: string,
): Promise<FixtureCompany> {
    const id = randomUUID();
    const name = `${run} ${label}`;
    await PoolQuery(
        ctx,
        `INSERT INTO __mj.Company (ID, Name, Description) VALUES ('${id}','${name}','${FIXTURE_TAG}')`,
    );

    // Accounting refuses to number journal entries for a company with no AccountingCompanyProfile
    // (spAssignNextJournalEntryNumber enforces it), so booking would fail without this row.
    // CompanyCode is short and unique-constrained; the UUID head keeps parallel runs from colliding.
    await PoolQuery(
        ctx,
        `INSERT INTO ${ACCT_SCHEMA}.AccountingCompanyProfile
            (ID, CompanyCode, FunctionalCurrencyCode, EntityType, OperatingTimeZone, IsActive)
         VALUES ('${id}','${id.slice(0, 8).toUpperCase()}','${currencyCode}','Subsidiary','UTC',1)`,
    );

    const accounts: Record<string, string> = {};
    for (const a of FIXTURE_ACCOUNTS) {
        accounts[a.Key] = randomUUID();
        await PoolQuery(
            ctx,
            `INSERT INTO ${ACCT_SCHEMA}.GLAccount (ID, CompanyID, Code, Name, AccountType, IsActive)
             VALUES ('${accounts[a.Key]}','${id}','${a.Code}','${a.Name}','${a.Type}',1)`,
        );
    }
    return { ID: id, Name: name, Accounts: accounts };
}

async function createOrganization(ctx: IntegrationCheckContext, run: string, label: string): Promise<string> {
    const id = randomUUID();
    await PoolQuery(
        ctx,
        `INSERT INTO ${COMMON_SCHEMA}.Organization (ID, Name) VALUES ('${id}','${run} ${label}')`,
    );
    return id;
}

async function createPerson(ctx: IntegrationCheckContext, run: string): Promise<string> {
    const id = randomUUID();
    await PoolQuery(
        ctx,
        `INSERT INTO ${COMMON_SCHEMA}.Person (ID, FirstName, LastName) VALUES ('${id}','Integration','${run}')`,
    );
    return id;
}

/**
 * Price a product THROUGH THE OBJECT MODEL, once.
 *
 * TWO THINGS THIS BUYS, and the first is the reason it exists at all.
 *
 * `ProductPriceEntityServer.ValidateAsync` enforces the AMBIGUITY GUARD: no two active rules may share
 * a product, price list, fee type and priority, because the engine refuses to pick between them rather
 * than take whichever the database returned first (D69). Thirteen raw-SQL prices across this suite
 * walked straight past that guard, which is why ambiguity kept surfacing at CONFIRM time — far from the
 * rule that caused it — instead of loudly here.
 *
 * And it is IDEMPOTENT by product, because a check that prices the same product twice creates exactly
 * the collision the guard exists to catch. Guarding here beats making every caller remember.
 */
export async function CreateProductPrice(
    ctx: IntegrationCheckContext,
    productID: string,
    amount: number,
    opts: {
        PricingModel?: string;
        FeeType?: string;
        Priority?: number;
        PriceListID?: string | null;
        MinQuantity?: number | null;
        MaxQuantity?: number | null;
        EffectiveFrom?: string;
        EffectiveTo?: string | null;
        PackageQuantity?: number | null;
    } = {},
): Promise<string | null> {
    const existing = await TxQuery<{ ID: string }>(
        ctx,
        `SELECT ID FROM ${ORDERS_SCHEMA}.ProductPrice
          WHERE ProductID='${productID}' AND Status='Active'
            AND FeeType='${(opts.FeeType ?? 'Standard').replace(/'/g, "''")}'
            AND Priority=${opts.Priority ?? 0}
            AND ${opts.PriceListID ? `PriceListID='${opts.PriceListID}'` : 'PriceListID IS NULL'}`,
    );
    if (existing.length) return existing[0].ID;

    return createViaEntity(ctx, PRODUCT_PRICE_ENTITY, {
        ProductID: productID,
        PricingModel: opts.PricingModel ?? 'PerUnit',
        FeeType: opts.FeeType ?? 'Standard',
        Amount: amount,
        EffectiveFrom: opts.EffectiveFrom ?? '2020-01-01',
        EffectiveTo: opts.EffectiveTo ?? null,
        Priority: opts.Priority ?? 0,
        Status: 'Active',
        PriceListID: opts.PriceListID ?? null,
        MinQuantity: opts.MinQuantity ?? null,
        MaxQuantity: opts.MaxQuantity ?? null,
        PackageQuantity: opts.PackageQuantity ?? null,
    });
}

/**
 * A promotion, its redeemable code and any product target — through the object model.
 *
 * `Promotion` is the offer and `PromotionCode` is the string a customer presents (D70); they are
 * separate rows because one offer can have many codes. Returns the code, since that is what an order
 * actually carries.
 */
export async function CreatePromotion(
    ctx: IntegrationCheckContext,
    opts: {
        Kind?: string;
        Value: number;
        AppliesAt?: string;
        TargetProductID?: string | null;
        TargetProductCategoryID?: string | null;
        Code?: string;
        MinimumOrderAmount?: number | null;
        StackingMode?: string | null;
    },
): Promise<string> {
    const code = opts.Code ?? `IT-${randomUUID().slice(0, 6).toUpperCase()}`;
    const type = await TxOne<{ ID: string }>(
        ctx,
        `SELECT ID FROM ${ORDERS_SCHEMA}.PromotionType WHERE Code='${opts.Kind ?? 'PercentOff'}'`,
    );

    const promotionID = await createViaEntity(ctx, PROMOTION_ENTITY, {
        Code: code,
        Name: code,
        PromotionTypeID: type.ID,
        Value: opts.Value,
        AppliesAt: opts.AppliesAt ?? 'Either',
        Status: 'Active',
        MinimumOrderAmount: opts.MinimumOrderAmount ?? null,
    });

    await createViaEntity(ctx, PROMOTION_CODE_ENTITY, {
        PromotionID: promotionID,
        Code: code,
        Status: 'Active',
    });

    if (opts.TargetProductID || opts.TargetProductCategoryID) {
        await createViaEntity(ctx, PROMOTION_TARGET_ENTITY, {
            PromotionID: promotionID,
            ProductID: opts.TargetProductID ?? null,
            ProductCategoryID: opts.TargetProductCategoryID ?? null,
            IncludeDescendants: true,
        });
    }
    return code;
}

/**
 * Create one row THROUGH THE OBJECT MODEL and return its id.
 *
 * WHY THE CATALOG IS BUILT THIS WAY AND NOT WITH `INSERT`.
 *
 * Creating a product IS part of the product. A fixture that inserts one by hand skips every
 * validation, default and Save-override the application would run, so the suite proves that ORDERS
 * work against a catalog that never went through our software — and any defect in the catalog path is
 * invisible by construction. `ProductPriceEntityServer` is the sharpest case: it enforces the
 * price-ambiguity guard (no two active rules sharing product, list, fee type and priority), and every
 * raw-SQL price in this suite walked straight past it. That is why ambiguity kept surfacing at CONFIRM
 * time, far from the rule that caused it, instead of loudly at creation.
 *
 * WHAT IS DELIBERATELY STILL SQL: rows this application does not own — `__mj.Company`, accounting's
 * `GLAccount`/`GLAccountLink`/tax geography, common's `Organization`/`Person`/`Address`. Creating
 * those through their own entity APIs would test THEIR software, not ours, and couple this fixture to
 * their Save-overrides. The boundary is ownership, not convenience.
 *
 * Failures are loud and name the entity: a fixture that half-builds leaves every check in the bundle
 * failing for a reason that has nothing to do with what it was testing.
 */
async function createViaEntity(
    ctx: IntegrationCheckContext,
    entityName: string,
    fields: Record<string, unknown>,
): Promise<string> {
    const md = new Metadata();
    const entity = await md.GetEntityObject<BaseEntity & Record<string, unknown>>(entityName, ctx.User);
    entity.NewRecord();
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) entity.Set(key, value);
    }
    if (!(await entity.Save())) {
        // `CompleteMessage` is often empty on a validation failure — the detail lives in `Errors`, one
        // entry per offending field. Reporting only the message turns a precise "Field X is required"
        // into "unknown error", which is how a fixture failure becomes a twenty-minute hunt.
        const result = entity.LatestResult;
        const detail =
            (result?.Errors ?? [])
                .map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
                .join('; ') || result?.CompleteMessage || 'no reason given';
        throw new Error(`Fixture could not create a '${entityName}' through the object model: ${detail}`);
    }
    return entity.Get('ID') as string;
}

async function createProductType(
    ctx: IntegrationCheckContext,
    run: string,
    label: string,
    opts: {
        ProductExtensionEntity?: string;
        OrderLineExtensionEntity?: string;
        DefaultRevenueRecognitionTypeID?: string;
        /** Entitlement policy backstops (D76). Left to the entity's own defaults when not stated. */
        DefaultEntitlementGrantTiming?: string;
        DefaultEntitlementQuantityMode?: string;
        DefaultEntitlementValidityMode?: string;
    } = {},
): Promise<string> {
    // The three policy columns are NOT NULL with database defaults. Passing `undefined` leaves them
    // to the entity rather than writing a value, which is the point: the fixture should exercise the
    // defaults a real caller gets, not paper over them.
    return createViaEntity(ctx, PRODUCT_TYPE_ENTITY, {
        Name: `${run} ${label}`,
        RequiresFulfillment: false,
        IsActive: true,
        ProductExtensionEntity: opts.ProductExtensionEntity,
        OrderLineExtensionEntity: opts.OrderLineExtensionEntity,
        DefaultRevenueRecognitionTypeID: opts.DefaultRevenueRecognitionTypeID,
        DefaultEntitlementGrantTiming: opts.DefaultEntitlementGrantTiming ?? 'OnConfirm',
        DefaultEntitlementQuantityMode: opts.DefaultEntitlementQuantityMode ?? 'PerUnit',
        DefaultEntitlementValidityMode: opts.DefaultEntitlementValidityMode ?? 'Perpetual',
    });
}

/**
 * Attach an entitlement TEMPLATE to a product (D27/D76).
 *
 * Returns the template ID so a check can assert against the grants it produced. `ValidityMode` here
 * overrides the product/category/type walk, which is the point of having it on the template: one
 * product can grant a perpetual download and ninety days of forum access at the same time.
 */
async function addEntitlement(
    ctx: IntegrationCheckContext,
    productID: string,
    opts: {
        Code: string;
        EntitlementType?: 'Feature' | 'AccessLevel' | 'ResourceQuantity' | 'Custom';
        Quantity?: number | null;
        UnitOfMeasure?: string;
        ValidityMode?: string | null;
        ValidityDurationDays?: number | null;
        AccessLeadHours?: number | null;
        AccessLagHours?: number | null;
    },
): Promise<string> {
    return createViaEntity(ctx, PRODUCT_ENTITLEMENT_ENTITY, {
        ProductID: productID,
        EntitlementType: opts.EntitlementType ?? 'Feature',
        Code: opts.Code,
        Name: opts.Code,
        Quantity: opts.Quantity ?? null,
        UnitOfMeasure: opts.UnitOfMeasure ?? null,
        IsActive: true,
        ValidityMode: opts.ValidityMode ?? null,
        ValidityDurationDays: opts.ValidityDurationDays ?? null,
        AccessLeadHours: opts.AccessLeadHours ?? null,
        AccessLagHours: opts.AccessLagHours ?? null,
    });
}

async function createCategory(
    ctx: IntegrationCheckContext,
    run: string,
    companyID: string,
    label: string,
): Promise<string> {
    return createViaEntity(ctx, PRODUCT_CATEGORY_ENTITY, {
        CompanyID: companyID,
        Name: `${run} ${label}`,
        IsActive: true,
    });
}

async function createProduct(
    ctx: IntegrationCheckContext,
    run: string,
    companyID: string,
    productTypeID: string,
    categoryID: string,
    label: string,
    revRecTypeID: string,
    subscriptionTypeID?: string,
): Promise<string> {
    return createViaEntity(ctx, PRODUCT_ENTITY, {
        CompanyID: companyID,
        ProductTypeID: productTypeID,
        ProductCategoryID: categoryID,
        Name: `${run} ${label}`,
        Status: 'Active',
        RevenueRecognitionTypeID: revRecTypeID,
        SubscriptionTypeID: subscriptionTypeID,
    });
}

// ─── Teardown ──────────────────────────────────────────────────────────────────────────────────

/**
 * Sweep the fixture. Best-effort by contract (a check failure must still clean up), so every
 * statement is individually caught.
 *
 * Because mutating checks roll back, in the normal case there is no booked history here at all —
 * this is a catalog sweep. The order/JE/payment deletes are kept as a safety net for the abnormal
 * case (a check that somehow committed, or a future non-transactional check), and are ordered so
 * they'd succeed if they ever have work to do.
 */
export async function TeardownOrdersFixture(ctx: IntegrationCheckContext): Promise<void> {
    const f = currentFixture;
    if (!f) {
        return;
    }

    for (const statement of teardownStatements([f.CoA.ID, f.CoB.ID, f.CoC.ID], f.Run)) {
        try {
            await PoolQuery(ctx, statement);
        } catch (e) {
            console.warn(`      teardown warn: ${String((e as Error).message).split('\n')[0]}`);
        }
    }
    currentFixture = undefined;
}

/**
 * Remove EVERY fixture run's data, not just the current one.
 *
 * `TeardownOrdersFixture` is scoped to the companies of the run that is finishing, which is right
 * for a test run and wrong for housekeeping: each run mints new companies, so an interrupted run —
 * or the review-data seeder, which commits on purpose — leaves rows nothing later will reach.
 *
 * Finds every company the fixture has ever created (they are all named `IT-ORD-…`) and sweeps them.
 * Safe to run against a development database and nowhere else; it deletes orders.
 */
export async function PurgeAllFixtureData(ctx: IntegrationCheckContext): Promise<number> {
    const runs = await PoolQuery<{ ID: string; Name: string }>(
        ctx,
        `SELECT ID, Name FROM __mj.Company WHERE Name LIKE 'IT-ORD-%'`,
    );
    if (!runs.length) return 0;

    // One sweep over ALL of them: the runs share products and tax geography only by coincidence of
    // naming, but orders can reference any of it, so deleting run by run would hit FK failures in
    // whichever order it happened to pick.
    const ids = runs.map((r) => r.ID);
    const marks = [...new Set(runs.map((r) => r.Name.split(' ')[0]))];

    for (const mark of marks) {
        for (const statement of teardownStatements(ids, mark)) {
            try {
                await PoolQuery(ctx, statement);
            } catch (e) {
                // The WHOLE error. mssql puts the useful part ('The DELETE statement conflicted
                // with the REFERENCE constraint …') in `originalError`, and the first line of the
                // outer message is the useless 'Error executing SQL'.
                const err = e as Error & { originalError?: Error };
                const detail = err.originalError?.message ?? err.message;
                console.warn(`      purge warn: ${String(detail).split('\n')[0]}`);
                console.warn(`        ↳ ${statement.replace(/\s+/g, ' ').slice(0, 140)}`);
            }
        }
    }
    currentFixture = undefined;
    return runs.length;
}

/** The delete order, shared by the per-run teardown and the whole-database purge. */
function teardownStatements(companyIDs: string[], run: string): string[] {
    const companies = companyIDs.map((c) => `'${c}'`).join(',');
    const orderScope = `SELECT ID FROM ${ORDERS_SCHEMA}.OrderHeader WHERE CompanyID IN (${companies})`;

    return [
        // ── THE IMMUTABILITY TRIGGERS COME OFF FIRST ────────────────────────────────────────────
        // A confirmed line's JournalEntryID cannot be cleared and a captured PaymentLine cannot be
        // deleted — correctly, because in the application a correction is a reversal, never an
        // edit. Housekeeping is the one caller that is genuinely removing history rather than
        // rewriting it, so it disables them and puts them back.
        //
        // This was invisible until the review-data seeder committed orders: every check rolls back,
        // so teardown had only ever been asked to delete rows that were not there, and it "worked"
        // by having nothing to do.
        `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS_SCHEMA}.OrderLine`,
        `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentLine_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentLine`,
        `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentHeader`,
        `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentDetail_Immutable ON ${ORDERS_SCHEMA}.PaymentDetail`,

        // Money DETAIL that hangs off the lines — price components, adjustments and charges with
        // their allocations. These are what a line is made of, so they go before it.
        `DELETE FROM ${ORDERS_SCHEMA}.OrderLinePriceComponent WHERE OrderLineID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID IN (${orderScope}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.OrderAdjustmentAllocation WHERE OrderAdjustmentID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.OrderAdjustment WHERE OrderHeaderID IN (${orderScope}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.OrderAdjustment WHERE OrderHeaderID IN (${orderScope})`,
        `DELETE FROM ${ORDERS_SCHEMA}.OrderChargeAllocation WHERE OrderChargeID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.OrderCharge WHERE OrderHeaderID IN (${orderScope}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.OrderCharge WHERE OrderHeaderID IN (${orderScope})`,

        `UPDATE ${ORDERS_SCHEMA}.OrderLine SET JournalEntryID=NULL WHERE OrderHeaderID IN (${orderScope})`,
        `DELETE jel FROM ${ACCT_SCHEMA}.JournalEntryLine jel
            JOIN ${ACCT_SCHEMA}.JournalEntry je ON je.ID=jel.JournalEntryID WHERE je.CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT_SCHEMA}.JournalEntry WHERE CompanyID IN (${companies})`,
        `UPDATE ${ORDERS_SCHEMA}.OrderHeader SET InitialPaymentDetailID=NULL WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS_SCHEMA}.PaymentLine WHERE OrderHeaderID IN (${orderScope})`,
        `DELETE FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE ReceivingCompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS_SCHEMA}.PaymentDetail WHERE CompanyID IN (${companies})`,
        // The renewal pointer lives on the LINE now and carries no FK (D61), so nothing needs
        // clearing before Subscriptions go — deleting the lines takes it with them.
        `DELETE FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE SubscriptionID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Subscription WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.SubscriptionEvent WHERE SubscriptionID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Subscription WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.Subscription WHERE CompanyID IN (${companies})`,
        // IsA children go before their parents: same PK, but the FK points child → parent.
        `DELETE FROM ${ORDERS_SCHEMA}.EventOrderLine WHERE ID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID IN (${orderScope}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID IN (${orderScope})`,
        `DELETE FROM ${ORDERS_SCHEMA}.OrderHeader WHERE CompanyID IN (${companies})`,
        // ── the catalog ─────────────────────────────────────────────────────────────────────────
        // Everything that hangs off a Product goes first. This list is not guesswork: it is every
        // FK pointing at Product / ProductPrice / ProductCategory, read out of sys.foreign_keys.
        // The self-references (Product.SuccessorProductID, ProductCategory.Parent…) are cleared
        // rather than deleted, because a row cannot be deleted before itself.
        `DELETE FROM ${ORDERS_SCHEMA}.PriceTier WHERE ProductPriceID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.ProductPrice WHERE ProductID IN
              (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies})))`,
        `DELETE FROM ${ORDERS_SCHEMA}.ProductPrice WHERE ProductID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.PromotionTarget WHERE ProductID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies}))
              OR ProductCategoryID IN (SELECT ID FROM ${ORDERS_SCHEMA}.ProductCategory WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.ProductBundleItem WHERE BundleProductID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies}))
              OR ComponentProductID IN (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.ProductEntitlement WHERE ProductID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.ProductPerformanceObligation WHERE ProductID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies}))`,
        `UPDATE ${ORDERS_SCHEMA}.Product SET SuccessorProductID = NULL WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS_SCHEMA}.EventProduct WHERE ID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies})`,
        `UPDATE ${ORDERS_SCHEMA}.ProductCategory SET ParentProductCategoryID = NULL WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS_SCHEMA}.ProductCategory WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS_SCHEMA}.ProductType WHERE Name LIKE '${run}%'`,
        `DELETE FROM ${ACCT_SCHEMA}.GLAccountLink WHERE RecordID IN (${companies})`,
        // Tax geography (D73), inner-to-outer so the FKs hold.
        `DELETE FROM ${ACCT_SCHEMA}.CompanyTaxNexus WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT_SCHEMA}.TaxRate WHERE TaxJurisdictionID IN
           (SELECT ID FROM ${ACCT_SCHEMA}.TaxJurisdiction WHERE Code LIKE '${run}-%')`,
        `DELETE FROM ${ACCT_SCHEMA}.TaxJurisdiction WHERE Code LIKE '${run}-%'`,
        `DELETE FROM ${ACCT_SCHEMA}.TaxAuthority WHERE Code LIKE '${run}-%'`,
        `DELETE FROM ${ORDERS_SCHEMA}.CustomerTaxExemption
          WHERE OrganizationID IN (SELECT ID FROM ${COMMON_SCHEMA}.Organization WHERE Name LIKE '${run}%')
             OR PersonID IN (SELECT ID FROM ${COMMON_SCHEMA}.Person WHERE LastName LIKE '${run}%')`,
        // Charge-type links are keyed by CHARGE TYPE, not by company, so the company sweep above
        // does not reach them.
        `DELETE FROM ${ACCT_SCHEMA}.GLAccountLink
          WHERE RecordID IN (SELECT CAST(ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.ChargeType)`,
        `DELETE FROM ${ACCT_SCHEMA}.JournalEntrySequence WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT_SCHEMA}.IntercompanyAccountMatch
          WHERE SourceCompanyID IN (${companies}) OR TargetCompanyID IN (${companies})
             OR DueToGLAccountID IN (SELECT ID FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID IN (${companies}))
             OR DueFromGLAccountID IN (SELECT ID FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID IN (${companies}))`,
        `UPDATE ${ACCT_SCHEMA}.GLAccount SET ParentGLAccountID = NULL WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT_SCHEMA}.AccountingCompanyProfile WHERE ID IN (${companies})`,
        `DELETE FROM __mj.Company WHERE ID IN (${companies})`,
        `DELETE FROM ${COMMON_SCHEMA}.Organization WHERE Name LIKE '${run}%'`,
        `DELETE FROM ${COMMON_SCHEMA}.Person WHERE LastName = '${run}'`,

        // Back on, unconditionally. Leaving them off would let the NEXT run edit booked history
        // silently, and every check that proves a correction is refused would pass having proved
        // the opposite.
        `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS_SCHEMA}.OrderLine`,
        `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentLine_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentLine`,
        `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentHeader`,
        `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentDetail_Immutable ON ${ORDERS_SCHEMA}.PaymentDetail`,
    ];

}
