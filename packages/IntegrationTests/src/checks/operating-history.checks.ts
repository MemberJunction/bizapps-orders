/**
 * operating-history (ORD-HIST:v1) — committed, dated, idempotent cash spine.
 *
 * Sibling of catalog-world / wire-volume. This is the operating history FP&A
 * materializes: paid collections, open AR, partials, overdue, annuals that
 * renew inside the Friday 2026-11-20 horizon, and a cancelled annual that
 * must not.
 *
 * Client-safe. Import from `client-index.ts` only.
 *
 *   GRAPHQL_PORT=4103 node test-harnesses/integration-client.mjs operating-history
 */
import {
    Assert,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration/registry';
import {
    OrdersCancelSubscriptionOperation,
    type CancelSubscriptionOutput,
} from '@mj-biz-apps/orders-entities';
import {
    ORDER_HEADER_ENTITY,
    ORDER_LINE_ENTITY,
    SUBSCRIPTION_ENTITY,
} from '../entity-names.js';
import {
    ClientWorldState,
    IdList,
    OrgCodes,
    PersonEmails,
    QuoteFilter,
    ResolveClientWorld,
    View,
    type ClientWorld,
} from '../client-world.js';
import {
    ConfirmClientOrder,
    CreateClientPayment,
    TenderByCode,
    type ClientOrderSpec,
} from '../client-order-builder.js';

export const ORD_HIST_TAG = 'ORD-HIST:v1';

export const PLANT = {
    UnpaidArBcp: `${ORD_HIST_TAG} unpaid-ar-bcp`,
    UnpaidArHh: `${ORD_HIST_TAG} unpaid-ar-hh`,
    PartialArBcp: `${ORD_HIST_TAG} partial-ar-bcp`,
    OverdueArBcp: `${ORD_HIST_TAG} overdue-ar-bcp`,
    UnpaidMonthBcp: `${ORD_HIST_TAG} unpaid-month-bcp`,
    AnnualRenew1: `${ORD_HIST_TAG} annual-renew-1`,
    AnnualRenew2: `${ORD_HIST_TAG} annual-renew-2`,
    AnnualRenew3: `${ORD_HIST_TAG} annual-renew-3`,
    AnnualCancel: `${ORD_HIST_TAG} annual-cancel`,
} as const;

/** STYLE-HB @ 45 × 10. Open AR the cash plan must collect. */
export const UNPAID_AR_BCP_AMOUNT = 450;
/** HH-ANTH @ 210 × 2. */
export const UNPAID_AR_HH_AMOUNT = 420;
/** STYLE-HB @ 45 × 20, $300 captured, $600 open. */
export const PARTIAL_AR_GROSS = 900;
export const PARTIAL_AR_PAID = 300;
export const PARTIAL_AR_BALANCE = 600;
/** STYLE-HB @ 45 × 3, due well before AsOf. */
export const OVERDUE_AR_AMOUNT = 135;
export const MEM_IND_AMOUNT = 240;
export const MEM_MONTH_AMOUNT = 24;

interface HeaderRow {
    ID: string;
    OrderNumber: string;
    Status: string;
    Notes: string | null;
    Description: string | null;
    OrderDate: string | Date;
    CompanyID: string;
    BillToOrganizationID: string | null;
    TotalGross: number | null;
    AmountPaid: number | null;
    Balance: number | null;
}

interface LineRow {
    ID: string;
    OrderHeaderID: string;
    ProductID: string;
    Quantity: number;
}

interface SubscriptionRow {
    ID: string;
    OrderLineID: string;
    ProductID: string;
    Status: string;
}

const checks: NamedCheck[] = [
    {
        Id: 'operating-history.OH1',
        Name: 'OH1 — commit ORD-HIST:v1 (idempotent) over GraphQL',
        RequiresMutation: true,
        Fn: commitHistory,
    },
    {
        Id: 'operating-history.OH2',
        Name: 'OH2 — planted AR / partial / overdue balances are exact',
        RequiresMutation: true,
        Fn: assertPlantedBalances,
    },
    {
        Id: 'operating-history.OH3',
        Name: 'OH3 — OrderDate walks 2025-06 through 2026-11 on BCP and HH',
        RequiresMutation: true,
        Fn: assertCoverage,
    },
    {
        Id: 'operating-history.OH4',
        Name: 'OH4 — annuals materialized; the cancelled annual is Canceled',
        RequiresMutation: true,
        Fn: assertSubscriptions,
    },
    {
        Id: 'operating-history.OH5',
        Name: 'OH5 — paid volume sits at Balance 0; open AR remains open',
        RequiresMutation: true,
        Fn: assertPaidVsOpen,
    },
];

for (const check of checks) IntegrationCheckRegistry.Instance.Register(check);

IntegrationCheckRegistry.Instance.RegisterLifecycle('operating-history', {
    Setup: async (ctx) => {
        const world = await ResolveClientWorld(ctx);
        Assert(!!world.Companies.BCP, 'ORD-WORLD company BCP missing — run catalog-world first');
        Assert(!!world.Companies.HH, 'ORD-WORLD company HH missing — run catalog-world first');
        Assert(!!world.Products['STYLE-HB'], 'STYLE-HB missing');
        Assert(!!world.Products['HH-ANTH'], 'HH-ANTH missing');
        Assert(!!world.Products['MEM-IND'], 'MEM-IND missing');
        Assert(!!world.Products['MEM-MONTH'], 'MEM-MONTH missing');
        Assert(!!world.Products['CONF-2027'], 'CONF-2027 missing');
        console.log(`      operating-history tag ${ORD_HIST_TAG}`);
    },
    Teardown: async () => {
        /* committed on purpose */
    },
});

async function commitHistory(ctx: IntegrationCheckContext): Promise<void> {
    const world = ClientWorldState();
    const specs = historySpecs(world);
    const existing = await loadTaggedHeaders(ctx);
    const have = new Set(existing.map((h) => (h.Description ?? '').trim()));

    let booked = 0;
    let skipped = 0;
    let failed = 0;
    let firstFailure: string | undefined;

    for (let i = 0; i < specs.length; i++) {
        const spec = specs[i];
        const key = (spec.Description ?? '').trim();
        if (have.has(key)) {
            skipped += 1;
            continue;
        }
        let result: Awaited<ReturnType<typeof ConfirmClientOrder>>;
        try {
            result = await ConfirmClientOrder(ctx.User, spec, ctx.Provider);
        } catch (err) {
            failed += 1;
            const message = err instanceof Error ? err.message : String(err);
            firstFailure ??= `${key}: ${message}`;
            console.warn(`      OH1 throw ${key}: ${message}`);
            continue;
        }
        if (!result.Saved) {
            failed += 1;
            firstFailure ??= `${key}: ${result.Message}`;
            console.warn(`      OH1 fail ${key}: ${result.Message}`);
            continue;
        }
        booked += 1;
        have.add(key);
        if ((booked + skipped) % 10 === 0) {
            console.log(`      OH1 booked=${booked} skipped=${skipped} failed=${failed} / ${specs.length}`);
        }
    }

    await cancelPlantedAnnual(ctx, world);
    await settleIntendedPaid(ctx, world);

    Assert(
        failed === 0,
        `ORD-HIST booking failed (${failed}): ${firstFailure ?? 'unknown'}`,
    );
    const after = await loadTaggedHeaders(ctx);
    Assert(after.length >= specs.length, `expected ≥${specs.length} tagged headers, got ${after.length}`);
    console.log(`      OH1 done booked=${booked} skipped=${skipped} tagged=${after.length}`);
}

async function assertPlantedBalances(ctx: IntegrationCheckContext): Promise<void> {
    const unpaidBcp = await requirePlant(ctx, PLANT.UnpaidArBcp);
    Assert(Number(unpaidBcp.Balance) > 0, `${PLANT.UnpaidArBcp} stays open`);
    assertMoney(unpaidBcp.AmountPaid, 0, `${PLANT.UnpaidArBcp} AmountPaid`);
    assertMoney(unpaidBcp.Balance, Number(unpaidBcp.TotalGross), `${PLANT.UnpaidArBcp} Balance=TotalGross`);

    const unpaidHh = await requirePlant(ctx, PLANT.UnpaidArHh);
    Assert(Number(unpaidHh.Balance) > 0, `${PLANT.UnpaidArHh} stays open`);
    assertMoney(unpaidHh.AmountPaid, 0, `${PLANT.UnpaidArHh} AmountPaid`);

    const partial = await requirePlant(ctx, PLANT.PartialArBcp);
    assertMoney(partial.AmountPaid, PARTIAL_AR_PAID, `${PLANT.PartialArBcp} AmountPaid`);
    Assert(Number(partial.Balance) > 0, `${PLANT.PartialArBcp} remainder is open`);
    assertMoney(
        Number(partial.TotalGross) - Number(partial.AmountPaid),
        Number(partial.Balance),
        `${PLANT.PartialArBcp} Balance = TotalGross - AmountPaid`,
    );

    const overdue = await requirePlant(ctx, PLANT.OverdueArBcp);
    Assert(Number(overdue.Balance) > 0, `${PLANT.OverdueArBcp} stays open`);
    Assert(monthKey(overdue.OrderDate) <= '2026-08', 'overdue AR is dated on or before 2026-08');

    const month = await requirePlant(ctx, PLANT.UnpaidMonthBcp);
    Assert(Number(month.Balance) > 0, `${PLANT.UnpaidMonthBcp} stays open`);
}

async function assertCoverage(ctx: IntegrationCheckContext): Promise<void> {
    const world = ClientWorldState();
    const headers = await loadTaggedHeaders(ctx);
    Assert(headers.length >= 40, `expected a population, got ${headers.length}`);
    Assert(headers.every((h) => h.Status === 'Confirmed'), 'every ORD-HIST header is Confirmed');
    Assert(headers.every((h) => h.Notes === ORD_HIST_TAG), 'Notes is the idempotency tag');

    const months = new Set(headers.map((h) => monthKey(h.OrderDate)));
    Assert(months.has('2025-06'), `history starts 2025-06, saw ${[...months].sort().join(',')}`);
    Assert(months.has('2026-11') || months.has('2026-10'), 'history reaches late 2026');

    const bcp = headers.filter((h) => sameId(h.CompanyID, world.Companies.BCP));
    const hh = headers.filter((h) => sameId(h.CompanyID, world.Companies.HH));
    Assert(bcp.length >= 20, `BCP should carry the spine, got ${bcp.length}`);
    Assert(hh.length >= 8, `HH should carry anthology volume, got ${hh.length}`);
}

async function assertSubscriptions(ctx: IntegrationCheckContext): Promise<void> {
    const world = ClientWorldState();
    const renew1 = await requirePlant(ctx, PLANT.AnnualRenew1);
    const renew2 = await requirePlant(ctx, PLANT.AnnualRenew2);
    const renew3 = await requirePlant(ctx, PLANT.AnnualRenew3);
    const cancelled = await requirePlant(ctx, PLANT.AnnualCancel);

    const lines = await loadLines(ctx, [renew1.ID, renew2.ID, renew3.ID, cancelled.ID]);
    const annualLines = lines.filter((l) => sameId(l.ProductID, world.Products['MEM-IND']));
    Assert(annualLines.length >= 4, 'four planted annuals should have MEM-IND lines');

    const subs = await loadSubscriptions(ctx, annualLines.map((l) => l.ID));
    Assert(subs.length >= 4, 'confirming MEM-IND must materialize subscriptions');

    const cancelLine = lines.find(
        (l) => sameId(l.OrderHeaderID, cancelled.ID) && sameId(l.ProductID, world.Products['MEM-IND']),
    );
    Assert(!!cancelLine, 'cancelled plant has a MEM-IND line');
    const cancelSub = subs.find((s) => sameId(s.OrderLineID, cancelLine!.ID));
    Assert(!!cancelSub, 'cancelled plant has a subscription');
    Assert(
        cancelSub!.Status === 'Canceled',
        `annual-cancel subscription should be Canceled, was ${cancelSub!.Status}`,
    );

    const live = subs.filter((s) => s.Status === 'Active');
    Assert(live.length >= 3, `expected ≥3 Active annuals, got ${live.length}`);
}

async function assertPaidVsOpen(ctx: IntegrationCheckContext): Promise<void> {
    const headers = await loadTaggedHeaders(ctx);
    const paid = headers.filter((h) => Number(h.Balance ?? 0) === 0);
    const open = headers.filter((h) => Number(h.Balance ?? 0) > 0);
    Assert(paid.length >= 20, `paid volume should dominate, paid=${paid.length}`);
    Assert(open.length >= 4, `planted AR should remain open, open=${open.length}`);
    for (const plant of [PLANT.UnpaidArBcp, PLANT.UnpaidArHh, PLANT.PartialArBcp, PLANT.OverdueArBcp]) {
        const row = headers.find((h) => (h.Description ?? '').trim() === plant);
        Assert(!!row && Number(row.Balance ?? 0) > 0, `${plant} must stay open`);
    }
}

function historySpecs(world: ClientWorld): ClientOrderSpec[] {
    const orgs = OrgCodes(world);
    const emails = PersonEmails(world);
    const check = TenderByCode('Check');
    const specs: ClientOrderSpec[] = [];

    const party = (i: number) => ({
        BillToOrganizationID: world.Organizations[orgs[i % orgs.length]],
        ShipToOrganizationID: world.Organizations[orgs[(i + 2) % orgs.length]],
        ShipToPersonID: world.People[emails[i % emails.length]],
        ShipToAddressID: world.Addresses[['SantaClara', 'SanMateo', 'NYC', 'Riverside'][i % 4]],
    });

    const paidBcp = (
        description: string,
        date: Date,
        lines: ClientOrderSpec['Lines'],
        i: number,
    ): ClientOrderSpec => ({
        CompanyID: world.Companies.BCP,
        Notes: ORD_HIST_TAG,
        Description: description,
        OrderDate: date,
        ...party(i),
        Lines: lines,
    });

    specs.push(
        {
            CompanyID: world.Companies.BCP,
            Notes: ORD_HIST_TAG,
            Description: PLANT.UnpaidArBcp,
            OrderDate: utc('2026-11-01'),
            ...party(1),
            Lines: [{ ProductID: world.Products['STYLE-HB'], Quantity: 10, UnitPrice: 45 }],
        },
        {
            CompanyID: world.Companies.HH,
            Notes: ORD_HIST_TAG,
            Description: PLANT.UnpaidArHh,
            OrderDate: utc('2026-11-10'),
            ...party(2),
            Lines: [{ ProductID: world.Products['HH-ANTH'], Quantity: 2, UnitPrice: 210 }],
        },
        {
            CompanyID: world.Companies.BCP,
            Notes: ORD_HIST_TAG,
            Description: PLANT.PartialArBcp,
            OrderDate: utc('2026-10-15'),
            ...party(3),
            Lines: [{ ProductID: world.Products['STYLE-HB'], Quantity: 20, UnitPrice: 45 }],
            InitialPaymentTypeID: check.ID,
            InitialPaymentAmount: PARTIAL_AR_PAID,
            InitialPaymentReference: 'ORD-HIST-PARTIAL-1',
        },
        {
            CompanyID: world.Companies.BCP,
            Notes: ORD_HIST_TAG,
            Description: PLANT.OverdueArBcp,
            OrderDate: utc('2026-08-01'),
            ...party(4),
            Lines: [{ ProductID: world.Products['STYLE-HB'], Quantity: 3, UnitPrice: 45 }],
        },
        {
            CompanyID: world.Companies.BCP,
            Notes: ORD_HIST_TAG,
            Description: PLANT.UnpaidMonthBcp,
            OrderDate: utc('2026-11-05'),
            ...party(5),
            Lines: [{ ProductID: world.Products['MEM-MONTH'], Quantity: 1, UnitPrice: 24 }],
        },
        paidBcp(
            PLANT.AnnualRenew1,
            utc('2025-12-01'),
            [{ ProductID: world.Products['MEM-IND'], Quantity: 1, UnitPrice: 240 }],
            10,
        ),
        paidBcp(
            PLANT.AnnualRenew2,
            utc('2026-02-15'),
            [{ ProductID: world.Products['MEM-IND'], Quantity: 1, UnitPrice: 240 }],
            11,
        ),
        paidBcp(
            PLANT.AnnualRenew3,
            utc('2026-04-01'),
            [{ ProductID: world.Products['MEM-IND'], Quantity: 1, UnitPrice: 240 }],
            12,
        ),
        paidBcp(
            PLANT.AnnualCancel,
            utc('2025-11-01'),
            [{ ProductID: world.Products['MEM-IND'], Quantity: 1, UnitPrice: 240 }],
            13,
        ),
    );

    // Paid handbook spine: every 10 days 2025-06-01 → 2026-10-21.
    let i = 100;
    for (const date of eachDays(utc('2025-06-01'), utc('2026-10-21'), 10)) {
        const qty = (i % 3) + 1;
        specs.push(
            paidBcp(
                `${ORD_HIST_TAG} vol bcp-hb ${isoDay(date)}`,
                date,
                [{ ProductID: world.Products['STYLE-HB'], Quantity: qty, UnitPrice: 45 }],
                i++,
            ),
        );
    }

    // HH anthology, paid, monthly on the 8th.
    for (const date of eachMonth(utc('2025-06-08'), utc('2026-11-08'))) {
        specs.push({
            CompanyID: world.Companies.HH,
            Notes: ORD_HIST_TAG,
            Description: `${ORD_HIST_TAG} vol hh-anth ${isoDay(date)}`,
            OrderDate: date,
            ...party(i++),
            Lines: [{ ProductID: world.Products['HH-ANTH'], Quantity: 1, UnitPrice: 210 }],
        });
    }

    // Monthly memberships, paid, on the 12th — contracted recurring cash already collected.
    for (const date of eachMonth(utc('2025-06-12'), utc('2026-10-12'))) {
        specs.push(
            paidBcp(
                `${ORD_HIST_TAG} vol bcp-month ${isoDay(date)}`,
                date,
                [{ ProductID: world.Products['MEM-MONTH'], Quantity: 1, UnitPrice: 24 }],
                i++,
            ),
        );
    }

    // Conference tickets, paid, quarterly.
    for (const date of [utc('2025-09-15'), utc('2025-12-15'), utc('2026-03-15'), utc('2026-06-15'), utc('2026-09-15')]) {
        specs.push(
            paidBcp(
                `${ORD_HIST_TAG} vol bcp-conf ${isoDay(date)}`,
                date,
                [{ ProductID: world.Products['CONF-2027'], Quantity: 2, UnitPrice: 275 }],
                i++,
            ),
        );
    }

    // Extra paid annuals so the renewal adapter has a population, not three rows.
    for (const date of [
        utc('2025-07-01'),
        utc('2025-09-01'),
        utc('2025-10-01'),
        utc('2026-01-15'),
        utc('2026-03-01'),
        utc('2026-05-01'),
        utc('2026-06-01'),
        utc('2026-07-01'),
    ]) {
        specs.push(
            paidBcp(
                `${ORD_HIST_TAG} vol bcp-annual ${isoDay(date)}`,
                date,
                [{ ProductID: world.Products['MEM-IND'], Quantity: 1, UnitPrice: 240 }],
                i++,
            ),
        );
    }

    return specs;
}

const OPEN_PLANTS = new Set<string>([
    PLANT.UnpaidArBcp,
    PLANT.UnpaidArHh,
    PLANT.PartialArBcp,
    PLANT.OverdueArBcp,
    PLANT.UnpaidMonthBcp,
]);

/**
 * Tax (and any other charges) land on TotalGross after Confirm. An InitialPaymentType
 * with amount 0 captures nothing, so intended-paid volume is settled here with a Cash
 * payment for the remaining Balance. Idempotent: skip if already settled.
 */
async function settleIntendedPaid(ctx: IntegrationCheckContext, world: ClientWorld): Promise<void> {
    const cash = TenderByCode('Cash');
    const headers = await loadTaggedHeaders(ctx);
    let settled = 0;
    for (const header of headers) {
        const desc = (header.Description ?? '').trim();
        if (OPEN_PLANTS.has(desc)) continue;
        const remaining = Number(header.Balance ?? 0);
        if (remaining <= 0) continue;
        const paid = await CreateClientPayment(
            ctx.User,
            {
                PaymentNumber: `PAY-HIST-${header.OrderNumber}`,
                ReceivingCompanyID: header.CompanyID,
                PaymentTypeID: cash.ID,
                Amount: remaining,
                OrderHeaderID: header.ID,
                Notes: ORD_HIST_TAG,
                BillToOrganizationID: header.BillToOrganizationID ?? undefined,
            },
            ctx.Provider,
        );
        Assert(paid.Saved, `settle ${desc}: ${paid.Message}`);
        settled += 1;
    }
    console.log(`      OH1 settled ${settled} intended-paid headers`);
}

async function cancelPlantedAnnual(ctx: IntegrationCheckContext, world: ClientWorld): Promise<void> {
    const header = await requirePlant(ctx, PLANT.AnnualCancel);
    const lines = await loadLines(ctx, [header.ID]);
    const annual = lines.find((l) => sameId(l.ProductID, world.Products['MEM-IND']));
    Assert(!!annual, 'annual-cancel line missing');
    const subs = await loadSubscriptions(ctx, [annual!.ID]);
    Assert(subs.length === 1, 'annual-cancel should have one subscription');
    if (subs[0].Status === 'Canceled') return;

    const op = new OrdersCancelSubscriptionOperation();
    const result = await op.Execute(
        {
            SubscriptionID: subs[0].ID,
            RequestDate: '2026-06-01',
            Reason: `${ORD_HIST_TAG} planted cancel`,
        },
        { provider: ctx.Provider, user: ctx.User, mode: 'attached' },
    );
    Assert(result.Success, `Orders.CancelSubscription: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown'}`);
    const out = result.Output as CancelSubscriptionOutput | undefined;
    Assert(!!out?.Success, `CancelSubscription payload: ${out?.Message ?? 'none'}`);
}

async function requirePlant(ctx: IntegrationCheckContext, description: string): Promise<HeaderRow> {
    const headers = await loadTaggedHeaders(ctx);
    const row = headers.find((h) => (h.Description ?? '').trim() === description);
    Assert(!!row, `plant ${description} missing — OH1 should have booked it`);
    return row!;
}

async function loadTaggedHeaders(ctx: IntegrationCheckContext): Promise<HeaderRow[]> {
    const res = await View(ctx).RunView<HeaderRow>(
        {
            EntityName: ORDER_HEADER_ENTITY,
            ExtraFilter: `Notes = '${QuoteFilter(ORD_HIST_TAG)}'`,
            Fields: [
                'ID',
                'OrderNumber',
                'Status',
                'Notes',
                'Description',
                'OrderDate',
                'CompanyID',
                'BillToOrganizationID',
                'TotalGross',
                'AmountPaid',
                'Balance',
            ],
            MaxRows: 4000,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(res.Success, `tagged headers: ${res.ErrorMessage ?? 'unknown'}`);
    return res.Results ?? [];
}

async function loadLines(ctx: IntegrationCheckContext, headerIDs: string[]): Promise<LineRow[]> {
    const res = await View(ctx).RunView<LineRow>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID IN (${IdList(headerIDs)})`,
            Fields: ['ID', 'OrderHeaderID', 'ProductID', 'Quantity'],
            MaxRows: 4000,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(res.Success, `lines: ${res.ErrorMessage ?? 'unknown'}`);
    return res.Results ?? [];
}

async function loadSubscriptions(ctx: IntegrationCheckContext, lineIDs: string[]): Promise<SubscriptionRow[]> {
    const res = await View(ctx).RunView<SubscriptionRow>(
        {
            EntityName: SUBSCRIPTION_ENTITY,
            ExtraFilter: `OrderLineID IN (${IdList(lineIDs)})`,
            Fields: ['ID', 'OrderLineID', 'ProductID', 'Status'],
            MaxRows: 2000,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(res.Success, `subscriptions: ${res.ErrorMessage ?? 'unknown'}`);
    return res.Results ?? [];
}

function assertMoney(actual: number | null | undefined, expected: number, label: string): void {
    Assert(
        Math.abs(Number(actual ?? 0) - expected) < 0.005,
        `${label}: expected ${expected}, got ${actual}`,
    );
}

function sameId(a: string | null | undefined, b: string | null | undefined): boolean {
    return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

function utc(isoDay: string): Date {
    return new Date(`${isoDay}T12:00:00Z`);
}

function isoDay(value: Date): string {
    return value.toISOString().slice(0, 10);
}

function monthKey(value: string | Date): string {
    const d = new Date(value);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function eachDays(start: Date, end: Date, stepDays: number): Date[] {
    const out: Date[] = [];
    const cur = new Date(start.getTime());
    while (cur.getTime() <= end.getTime()) {
        out.push(new Date(cur.getTime()));
        cur.setUTCDate(cur.getUTCDate() + stepDays);
    }
    return out;
}

function eachMonth(start: Date, end: Date): Date[] {
    const out: Date[] = [];
    const cur = new Date(start.getTime());
    while (cur.getTime() <= end.getTime()) {
        out.push(new Date(cur.getTime()));
        cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return out;
}
