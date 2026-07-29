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
import { Metadata, RunView } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { Assert, type IntegrationCheckContext } from '@memberjunction/testing-integration';
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';

export const ORDERS_SCHEMA = '__mj_BizAppsOrders';
export const ACCT_SCHEMA = '__mj_BizAppsAccounting';
export const COMMON_SCHEMA = '__mj_BizAppsCommon';

/** Stamped on every fixture row so a stranded run is identifiable and sweepable by name. */
export const FIXTURE_TAG = '(bizapps-orders integration test — safe to delete)';

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
    fixture.ProductTypeIDs.Subscription = await createProductType(ctx, run, 'Subscription');
    // The extension pointers are what make this type an EVENT type rather than a label: they name
    // the IsA children that carry event data (BO-D37).
    fixture.ProductTypeIDs.Event = await createProductType(ctx, run, 'Event', {
        ProductExtensionEntity: 'MJ_BizApps_Orders: Event Products',
        OrderLineExtensionEntity: 'MJ_BizApps_Orders: Event Order Lines',
        DefaultRevenueRecognitionTypeID: rr('AllBackEnd'),
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
        await PoolQuery(
            ctx,
            `INSERT INTO ${ORDERS_SCHEMA}.EventProduct
                (ID, EventStartsAt, EventEndsAt, VenueName, Capacity, RequiresAttendeeInfo)
             VALUES ('${ticket}','${fixture.Event.StartsAt.toISOString()}','${fixture.Event.EndsAt.toISOString()}',
                     '${run} Convention Center', 500, 1)`,
        );
    }

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

async function createProductType(
    ctx: IntegrationCheckContext,
    run: string,
    label: string,
    opts: {
        ProductExtensionEntity?: string;
        OrderLineExtensionEntity?: string;
        DefaultRevenueRecognitionTypeID?: string;
    } = {},
): Promise<string> {
    const id = randomUUID();
    const q = (v?: string) => (v ? `'${v.replace(/'/g, "''")}'` : 'NULL');
    await PoolQuery(
        ctx,
        `INSERT INTO ${ORDERS_SCHEMA}.ProductType
            (ID, Name, RequiresFulfillment, IsActive,
             ProductExtensionEntity, OrderLineExtensionEntity, DefaultRevenueRecognitionTypeID)
         VALUES ('${id}','${run} ${label}',0,1,
                 ${q(opts.ProductExtensionEntity)}, ${q(opts.OrderLineExtensionEntity)},
                 ${q(opts.DefaultRevenueRecognitionTypeID)})`,
    );
    return id;
}

async function createCategory(
    ctx: IntegrationCheckContext,
    run: string,
    companyID: string,
    label: string,
): Promise<string> {
    const id = randomUUID();
    await PoolQuery(
        ctx,
        `INSERT INTO ${ORDERS_SCHEMA}.ProductCategory (ID, CompanyID, Name, IsActive)
         VALUES ('${id}','${companyID}','${run} ${label}',1)`,
    );
    return id;
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
    const id = randomUUID();
    await PoolQuery(
        ctx,
        `INSERT INTO ${ORDERS_SCHEMA}.Product
            (ID, CompanyID, ProductTypeID, ProductCategoryID, Name, Status, RevenueRecognitionTypeID, SubscriptionTypeID, IsTaxable)
         VALUES ('${id}','${companyID}','${productTypeID}','${categoryID}','${run} ${label}','Active',
                 '${revRecTypeID}',${subscriptionTypeID ? `'${subscriptionTypeID}'` : 'NULL'},1)`,
        // IsTaxable = 1. It was hardcoded 0 when this fixture predated tax resolution, which made
        // every product silently non-taxable — so the tax checks measured a zero the engine was
        // producing CORRECTLY, for a reason that had nothing to do with what they were testing.
    );
    return id;
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

    const companies = [f.CoA.ID, f.CoB.ID, f.CoC.ID].map((c) => `'${c}'`).join(',');
    const orderScope = `SELECT ID FROM ${ORDERS_SCHEMA}.OrderHeader WHERE CompanyID IN (${companies})`;

    const statements = [
        // safety net — nothing to do when every mutating check rolled back
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
        // the catalog itself — the only rows that normally exist
        `DELETE FROM ${ORDERS_SCHEMA}.EventProduct WHERE ID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS_SCHEMA}.ProductCategory WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS_SCHEMA}.ProductType WHERE Name LIKE '${f.Run}%'`,
        `DELETE FROM ${ACCT_SCHEMA}.GLAccountLink WHERE RecordID IN (${companies})`,
        // Tax geography (D73), inner-to-outer so the FKs hold.
        `DELETE FROM ${ACCT_SCHEMA}.CompanyTaxNexus WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT_SCHEMA}.TaxRate WHERE TaxJurisdictionID IN
           (SELECT ID FROM ${ACCT_SCHEMA}.TaxJurisdiction WHERE Code LIKE '${f.Run}-%')`,
        `DELETE FROM ${ACCT_SCHEMA}.TaxJurisdiction WHERE Code LIKE '${f.Run}-%'`,
        `DELETE FROM ${ACCT_SCHEMA}.TaxAuthority WHERE Code LIKE '${f.Run}-%'`,
        `DELETE FROM ${ORDERS_SCHEMA}.CustomerTaxExemption
          WHERE OrganizationID IN (SELECT ID FROM ${COMMON_SCHEMA}.Organization WHERE Name LIKE '${f.Run}%')
             OR PersonID IN (SELECT ID FROM ${COMMON_SCHEMA}.Person WHERE LastName LIKE '${f.Run}%')`,
        // Charge-type links are keyed by CHARGE TYPE, not by company, so the company sweep above
        // does not reach them.
        `DELETE FROM ${ACCT_SCHEMA}.GLAccountLink
          WHERE RecordID IN (SELECT CAST(ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.ChargeType)`,
        `DELETE FROM ${ACCT_SCHEMA}.JournalEntrySequence WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT_SCHEMA}.AccountingCompanyProfile WHERE ID IN (${companies})`,
        `DELETE FROM __mj.Company WHERE ID IN (${companies})`,
        `DELETE FROM ${COMMON_SCHEMA}.Organization WHERE Name LIKE '${f.Run}%'`,
        `DELETE FROM ${COMMON_SCHEMA}.Person WHERE LastName = '${f.Run}'`,
    ];

    for (const statement of statements) {
        try {
            await PoolQuery(ctx, statement);
        } catch (e) {
            console.warn(`      teardown warn: ${String((e as Error).message).split('\n')[0]}`);
        }
    }
    currentFixture = undefined;
}
