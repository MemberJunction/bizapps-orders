/**
 * Client-transport volume. Import from `client-index.ts` only — the main barrel
 * loads *Server subclasses that throw on GraphQLDataProvider.
 *
 * Data is COMMITTED (no InRolledBackTransaction). Every header Notes = WIRE-VOL:<runId>.
 */
import {
    Assert,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration/registry';
import {
    OrderHeaderEntity,
    OrdersSpawnRenewalsOperation,
    type SpawnRenewalsOutput,
} from '@mj-biz-apps/orders-entities';
import {
    EVENT_ORDER_LINE_ENTITY,
    ORDER_HEADER_ENTITY,
    ORDER_LINE_ENTITY,
    PAYMENT_HEADER_ENTITY,
    PAYMENT_LINE_ENTITY,
    SUBSCRIPTION_ENTITY,
    SUBSCRIPTION_TERM_ENTITY,
} from '../entity-names.js';
import {
    AddRunPeople,
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
    CreateReferenceDetail,
    TenderByCode,
    type ClientLineSpec,
    type ClientOrderSpec,
} from '../client-order-builder.js';

export interface WireVolumeRun {
    RunId: string;
    Tag: string;
    Confirmed: number;
    Failed: number;
    FirstFailure?: string;
    PaymentSeq: number;
    SeatEmails: string[];
}

let run: WireVolumeRun | undefined;

export function WireVolumeRunState(): WireVolumeRun {
    if (!run) throw new Error('wire-volume run is not set up');
    return run;
}

function volumeCount(): number {
    const raw = Number.parseInt(process.env.WIRE_VOL_COUNT ?? '200', 10);
    if (!Number.isFinite(raw) || raw < 1) return 200;
    return Math.min(raw, 2000);
}

function newRunId(): string {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${stamp}-${suffix}`;
}

interface HeaderRow {
    ID: string;
    OrderNumber: string;
    Status: string;
    Notes: string | null;
    OrderDate: string | Date;
    BillToOrganizationID: string | null;
    ShipToOrganizationID: string | null;
    ShipToPersonID: string | null;
    TotalGross: number | null;
    AmountPaid: number | null;
    Balance: number | null;
}

interface LineRow {
    ID: string;
    OrderHeaderID: string;
    ProductID: string;
    ShipToPersonID: string | null;
    Quantity: number;
}

interface PaymentLineRow {
    ID: string;
    PaymentHeaderID: string;
    OrderHeaderID: string;
    Amount: number;
}

interface PaymentHeaderRow {
    ID: string;
    PaymentTypeID: string;
    Amount: number;
    Status: string;
    Notes: string | null;
}

interface EventLineRow {
    ID: string;
    PersonID: string;
}

interface SubscriptionRow {
    ID: string;
    OrderLineID: string;
    ProductID: string;
}

interface TermRow {
    ID: string;
    SubscriptionID: string;
    EndDate: string | Date;
    TermNumber: number;
}

const checks: NamedCheck[] = [
    {
        Id: 'wire-volume.WV1',
        Name: 'WV1 — confirm a dated population of ORD-WORLD orders over GraphQL',
        RequiresMutation: true,
        Fn: confirmPopulation,
    },
    {
        Id: 'wire-volume.WV2',
        Name: 'WV2 — tagged headers are Confirmed and walk OrderDate across months',
        RequiresMutation: true,
        Fn: assertPopulationDates,
    },
    {
        Id: 'wire-volume.WV3',
        Name: 'WV3 — Cash, Check and Wire land; some orders have two payments',
        RequiresMutation: true,
        Fn: assertPayments,
    },
    {
        Id: 'wire-volume.WV4',
        Name: 'WV4 — SpawnRenewals places a continuation of a back-dated annual',
        RequiresMutation: true,
        Fn: spawnAndAssertRenewals,
    },
    {
        Id: 'wire-volume.WV5',
        Name: 'WV5 — parallel SubSeat lines resolve to different ShipToPersonID',
        RequiresMutation: true,
        Fn: assertParallelSeats,
    },
    {
        Id: 'wire-volume.WV6',
        Name: 'WV6 — event tickets name distinct attendees on ShipToPersonID',
        RequiresMutation: true,
        Fn: assertEventAttendees,
    },
    {
        Id: 'wire-volume.WV7',
        Name: 'WV7 — bill-to and ship-to vary across the committed population',
        RequiresMutation: true,
        Fn: assertPartyVariety,
    },
];

for (const check of checks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('wire-volume', {
    Setup: async (ctx) => {
        await ResolveClientWorld(ctx);
        run = {
            RunId: newRunId(),
            Tag: '',
            Confirmed: 0,
            Failed: 0,
            PaymentSeq: 0,
            SeatEmails: [],
        };
        run.Tag = `WIRE-VOL:${run.RunId}`;
        run.SeatEmails = await AddRunPeople(ctx, run.RunId, 9);
        console.log(`      wire-volume tag ${run.Tag}  count=${volumeCount()}`);
    },
    Teardown: async () => {
        // Committed on purpose — purge with test-harnesses/purge-wire-volume.mjs
    },
});

async function confirmPopulation(ctx: IntegrationCheckContext): Promise<void> {
    const world = ClientWorldState();
    const state = WireVolumeRunState();
    const count = volumeCount();
    for (let i = 0; i < count; i++) {
        const spec = specFor(world, state, i);
        let result: Awaited<ReturnType<typeof ConfirmClientOrder>>;
        try {
            result = await ConfirmClientOrder(ctx.User, spec, ctx.Provider);
        } catch (err) {
            state.Failed += 1;
            const message = err instanceof Error ? err.message : String(err);
            state.FirstFailure ??= `index ${i} (${spec.Description}): ${message}`;
            console.warn(`      WV1 throw #${i} ${spec.Description}: ${message}`);
            continue;
        }
        if (!result.Saved) {
            state.Failed += 1;
            state.FirstFailure ??= `index ${i} (${spec.Description}): ${result.Message}`;
            console.warn(`      WV1 fail #${i} ${spec.Description}: ${result.Message}`);
            continue;
        }
        state.Confirmed += 1;
        await applyFollowOnPayment(ctx, world, state, result.Order.ID, spec, i);
        if ((i + 1) % 10 === 0) {
            console.log(`      WV1 ${i + 1}/${count} confirmed=${state.Confirmed} failed=${state.Failed}`);
        }
    }
    Assert(state.Confirmed > 0, `no orders confirmed: ${state.FirstFailure ?? 'unknown'}`);
    Assert(
        state.Confirmed >= Math.floor(count * 0.8),
        `only ${state.Confirmed}/${count} confirmed: ${state.FirstFailure ?? 'see logs'}`,
    );
}

async function assertPopulationDates(ctx: IntegrationCheckContext): Promise<void> {
    const headers = await loadTaggedHeaders(ctx);
    Assert(headers.length > 0, 'no tagged Order Headers visible via RunView');
    Assert(
        headers.every((h) => h.Status === 'Confirmed'),
        'every tagged header is Confirmed',
    );
    const months = new Set(headers.map((h) => monthKey(h.OrderDate)));
    Assert(months.size >= 2, `OrderDate should span months, saw ${[...months].join(',')}`);
}

async function assertPayments(ctx: IntegrationCheckContext): Promise<void> {
    const headers = await loadTaggedHeaders(ctx);
    const pays = await loadPaymentsFor(ctx, headers.map((h) => h.ID));
    const typeIDs = new Set(pays.headers.map((p) => p.PaymentTypeID));
    const world = ClientWorldState();
    Assert(typeIDs.has(world.PaymentTypes.Cash.ID), 'Cash payments present');
    Assert(typeIDs.has(world.PaymentTypes.Check.ID), 'Check payments present');
    Assert(typeIDs.has(world.PaymentTypes.Wire.ID), 'Wire payments present');
    Assert(!pays.headers.some((p) => isCardOrAch(world, p.PaymentTypeID)), 'no CreditCard/ACH');

    const byOrder = new Map<string, number>();
    for (const line of pays.lines) {
        byOrder.set(line.OrderHeaderID, (byOrder.get(line.OrderHeaderID) ?? 0) + 1);
    }
    const splits = [...byOrder.values()].filter((n) => n >= 2).length;
    Assert(splits > 0, 'at least one order has two payment lines (split tender)');
}

async function spawnAndAssertRenewals(ctx: IntegrationCheckContext): Promise<void> {
    const world = ClientWorldState();
    const state = WireVolumeRunState();
    const annuals = await loadTaggedHeaders(ctx);
    const lines = await loadLines(ctx, annuals.map((h) => h.ID));
    const annualLines = lines.filter((l) => l.ProductID === world.Products['MEM-IND']);
    Assert(annualLines.length > 0, 'back-dated annual lines should exist');

    const subs = await loadSubscriptions(ctx, annualLines.map((l) => l.ID));
    Assert(subs.length > 0, 'annual confirm should have materialized subscriptions');

    const terms = await loadTerms(ctx, subs.map((s) => s.ID));
    let placed = 0;
    for (const sub of subs.slice(0, 5)) {
        const term = terms.find((t) => t.SubscriptionID === sub.ID && Number(t.TermNumber) === 1);
        if (!term) continue;
        const asOf = daysBefore(term.EndDate, 10);
        const out = await spawnRenewal(ctx, sub.ID, asOf);
        const orderID = out.Candidates.find((c) => c.OrderID)?.OrderID;
        if (out.Placed > 0 && orderID) {
            placed += 1;
            await tagOrder(ctx, orderID, state.Tag);
            await confirmRenewalDraft(ctx, orderID);
        }
    }
    Assert(placed > 0, 'Orders.SpawnRenewals should place at least one renewal');
    const tagged = await loadTaggedHeaders(ctx);
    Assert(
        tagged.length > annuals.length,
        `spawned renewal should be tagged (${tagged.length} tagged headers, ${annuals.length} before spawn)`,
    );
}

async function assertParallelSeats(ctx: IntegrationCheckContext): Promise<void> {
    const world = ClientWorldState();
    const headers = await loadTaggedHeaders(ctx);
    const lines = await loadLines(ctx, headers.map((h) => h.ID));
    const seats = lines.filter((l) => l.ProductID === world.Products['MEM-SEAT']);
    Assert(seats.length >= 2, 'population should include named-seat lines');
    const people = new Set(seats.map((l) => l.ShipToPersonID).filter(Boolean));
    Assert(people.size >= 2, 'named seats should go to different people');
}

async function assertEventAttendees(ctx: IntegrationCheckContext): Promise<void> {
    const world = ClientWorldState();
    const headers = await loadTaggedHeaders(ctx);
    const lines = await loadLines(ctx, headers.map((h) => h.ID));
    const eventLines = lines.filter((l) => l.ProductID === world.Products['CONF-2027']);
    Assert(eventLines.length >= 2, 'population should include conference lines');
    const people = new Set(eventLines.map((l) => l.ShipToPersonID).filter(Boolean));
    Assert(people.size >= 2, 'event tickets should name different attendees (ShipToPersonID)');
}

async function assertPartyVariety(ctx: IntegrationCheckContext): Promise<void> {
    const headers = await loadTaggedHeaders(ctx);
    const bills = new Set(headers.map((h) => h.BillToOrganizationID).filter(Boolean));
    const ships = new Set(
        headers.map((h) => h.ShipToOrganizationID || h.ShipToPersonID).filter(Boolean),
    );
    Assert(bills.size >= 3, `bill-to should rotate, saw ${bills.size}`);
    Assert(ships.size >= 2, `ship-to should vary, saw ${ships.size}`);
    const mixed = headers.filter(
        (h) => h.BillToOrganizationID && h.ShipToOrganizationID && h.BillToOrganizationID !== h.ShipToOrganizationID,
    );
    Assert(mixed.length > 0, 'some orders should bill one org and ship to another');
}

function specFor(world: ClientWorld, state: WireVolumeRun, i: number): ClientOrderSpec {
    const orgs = OrgCodes(world);
    const emails = PersonEmails(world);
    const billCode = orgs[i % orgs.length];
    const shipCode = orgs[(i + 3) % orgs.length];
    const personEmail = emails[i % emails.length];
    const shape = i % 8;
    const orderDate = dateFor(i, shape);
    const spec: ClientOrderSpec = {
        CompanyID: world.Companies.BCP,
        Notes: state.Tag,
        Description: `WIRE-VOL ${shapeName(shape)} ${state.RunId}`,
        OrderDate: orderDate,
        BillToOrganizationID: world.Organizations[billCode],
        ShipToOrganizationID: world.Organizations[shipCode],
        ShipToPersonID: world.People[personEmail],
        ShipToAddressID: addressFor(world, i),
        Lines: linesFor(world, emails, shape, i, state),
    };
    applyInitialTender(spec, state, i);
    return spec;
}

function shapeName(shape: number): string {
    switch (shape) {
        case 0:
            return 'simple';
        case 1:
            return 'two-company';
        case 2:
            return 'annual';
        case 3:
            return 'monthly';
        case 4:
            return 'event';
        case 5:
            return 'seats';
        case 6:
            return 'mixed-party';
        default:
            return 'deferred';
    }
}

function dateFor(i: number, shape: number): Date {
    if (shape === 2) {
        return new Date('2025-01-01T12:00:00Z');
    }
    const start = new Date('2024-10-01T12:00:00Z');
    start.setUTCDate(start.getUTCDate() + i * 10);
    return start;
}

function addressFor(world: ClientWorld, i: number): string | undefined {
    const keys = ['SantaClara', 'SanMateo', 'NYC', 'Riverside'];
    return world.Addresses[keys[i % keys.length]];
}

function linesFor(
    world: ClientWorld,
    emails: string[],
    shape: number,
    i: number,
    state: WireVolumeRun,
): ClientLineSpec[] {
    switch (shape) {
        case 1:
            return [
                { ProductID: world.Products['STYLE-HB'], Quantity: 1, UnitPrice: 45 },
                { ProductID: world.Products['HH-ANTH'], Quantity: 1, UnitPrice: 210 },
            ];
        case 2:
            return [{ ProductID: world.Products['MEM-IND'], Quantity: 1, UnitPrice: 240 }];
        case 3:
            return [{ ProductID: world.Products['MEM-MONTH'], Quantity: 1, UnitPrice: 24 }];
        case 4:
            return eventLines(world, emails, i);
        case 5:
            return seatLines(world, state.SeatEmails, i);
        case 6:
            return [
                { ProductID: world.Products['STYLE-HB'], Quantity: 2, UnitPrice: 45 },
                { ProductID: world.Products['WORKSHOP'], Quantity: 1, UnitPrice: 150 },
            ];
        case 7:
            return [
                {
                    ProductID: world.Products['EDIT-COURSE'],
                    Quantity: 1,
                    UnitPrice: 480,
                    ServicePeriodStart: '2026-01-01',
                    ServicePeriodEnd: '2026-12-31',
                },
            ];
        default:
            return [{ ProductID: world.Products['STYLE-HB'], Quantity: (i % 3) + 1, UnitPrice: 45 }];
    }
}

function eventLines(world: ClientWorld, emails: string[], i: number): ClientLineSpec[] {
    const a = emails[i % emails.length];
    const b = emails[(i + 1) % emails.length];
    return [
        {
            ProductID: world.Products['CONF-2027'],
            Quantity: 1,
            UnitPrice: 275,
            ShipToPersonID: world.People[a],
        },
        {
            ProductID: world.Products['CONF-2027'],
            Quantity: 1,
            UnitPrice: 275,
            ShipToPersonID: world.People[b],
        },
    ];
}

function seatLines(world: ClientWorld, emails: string[], i: number): ClientLineSpec[] {
    const email = emails[i % emails.length];
    return [
        {
            ProductID: world.Products['MEM-SEAT'],
            Quantity: 1,
            UnitPrice: 180,
            ShipToPersonID: world.People[email],
        },
    ];
}

function applyInitialTender(spec: ClientOrderSpec, state: WireVolumeRun, i: number): void {
    const lane = i % 5;
    if (lane === 0) return;
    if (lane === 1) {
        spec.InitialPaymentTypeID = TenderByCode('Cash').ID;
        return;
    }
    if (lane === 2) {
        spec.InitialPaymentTypeID = TenderByCode('Check').ID;
        spec.InitialPaymentAmount = 20;
        spec.InitialPaymentReference = `CHK-${state.RunId}-${i}`;
        return;
    }
    if (lane === 3) {
        spec.InitialPaymentTypeID = TenderByCode('Wire').ID;
        spec.InitialPaymentAmount = 25;
        spec.InitialPaymentReference = `WIRE-${state.RunId}-${i}`;
        return;
    }
    spec.InitialPaymentTypeID = TenderByCode('Cash').ID;
    spec.InitialPaymentAmount = 15;
}

async function applyFollowOnPayment(
    ctx: IntegrationCheckContext,
    world: ClientWorld,
    state: WireVolumeRun,
    orderID: string,
    spec: ClientOrderSpec,
    index: number,
): Promise<void> {
    if (index % 5 !== 2 && index % 5 !== 4) return;
    const header = await loadHeader(ctx, orderID);
    const remaining = Number(header?.Balance ?? 0);
    if (remaining <= 0) return;

    const check = TenderByCode('Check');
    state.PaymentSeq += 1;
    const reference = `CHK-SPLIT-${state.RunId}-${state.PaymentSeq}`;
    const detailID = await CreateReferenceDetail(
        ctx.User,
        world.Companies.BCP,
        check.ID,
        reference,
        ctx.Provider,
    );
    const paid = await CreateClientPayment(
        ctx.User,
        {
            PaymentNumber: `PAY-WV-${state.RunId}-${String(state.PaymentSeq).padStart(4, '0')}`,
            ReceivingCompanyID: world.Companies.BCP,
            PaymentTypeID: check.ID,
            Amount: remaining,
            OrderHeaderID: orderID,
            Notes: state.Tag,
            PaymentDate: spec.OrderDate,
            BillToOrganizationID: spec.BillToOrganizationID,
            PaymentDetailID: detailID,
        },
        ctx.Provider,
    );
    Assert(paid.Saved, `split Check payment: ${paid.Message}`);
}

async function spawnRenewal(
    ctx: IntegrationCheckContext,
    subscriptionID: string,
    asOfDate: string,
): Promise<SpawnRenewalsOutput> {
    const op = new OrdersSpawnRenewalsOperation();
    const result = await op.Execute(
        { SubscriptionID: subscriptionID, AsOfDate: asOfDate },
        { provider: ctx.Provider, user: ctx.User, mode: 'attached' },
    );
    Assert(result.Success, `Orders.SpawnRenewals: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown'}`);
    Assert(result.Output != null, 'Orders.SpawnRenewals returned no payload');
    return result.Output;
}

async function confirmRenewalDraft(ctx: IntegrationCheckContext, orderID: string): Promise<void> {
    const order = await ctx.Provider.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, ctx.User);
    if (!(await order.Load(orderID))) {
        throw new Error(`could not load spawned renewal ${orderID}`);
    }
    if (order.Status === 'Confirmed') return;
    order.Status = 'Confirmed';
    const saved = await order.Save();
    Assert(saved, `confirm renewal ${orderID}: ${order.LatestResult?.CompleteMessage ?? 'unknown'}`);
}

async function tagOrder(ctx: IntegrationCheckContext, orderID: string, tag: string): Promise<void> {
    const order = await ctx.Provider.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, ctx.User);
    if (!(await order.Load(orderID))) return;
    order.Notes = tag;
    const saved = await order.Save();
    Assert(saved, `tag renewal ${orderID}: ${order.LatestResult?.CompleteMessage ?? 'unknown'}`);
}

async function loadTaggedHeaders(ctx: IntegrationCheckContext): Promise<HeaderRow[]> {
    const tag = QuoteFilter(WireVolumeRunState().Tag);
    const res = await View(ctx).RunView<HeaderRow>(
        {
            EntityName: ORDER_HEADER_ENTITY,
            ExtraFilter: `Notes = '${tag}'`,
            Fields: [
                'ID',
                'OrderNumber',
                'Status',
                'Notes',
                'OrderDate',
                'BillToOrganizationID',
                'ShipToOrganizationID',
                'ShipToPersonID',
                'TotalGross',
                'AmountPaid',
                'Balance',
            ],
            MaxRows: 2000,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(res.Success, `tagged headers: ${res.ErrorMessage ?? 'unknown'}`);
    return res.Results ?? [];
}

async function loadHeader(ctx: IntegrationCheckContext, id: string): Promise<HeaderRow | undefined> {
    const res = await View(ctx).RunView<HeaderRow>(
        {
            EntityName: ORDER_HEADER_ENTITY,
            ExtraFilter: `ID = '${QuoteFilter(id)}'`,
            Fields: [
                'ID',
                'OrderNumber',
                'Status',
                'Notes',
                'OrderDate',
                'BillToOrganizationID',
                'ShipToOrganizationID',
                'ShipToPersonID',
                'TotalGross',
                'AmountPaid',
                'Balance',
            ],
            MaxRows: 1,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(res.Success, `header ${id}: ${res.ErrorMessage ?? 'unknown'}`);
    return res.Results?.[0];
}

async function loadLines(ctx: IntegrationCheckContext, headerIDs: string[]): Promise<LineRow[]> {
    const res = await View(ctx).RunView<LineRow>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID IN (${IdList(headerIDs)})`,
            Fields: ['ID', 'OrderHeaderID', 'ProductID', 'ShipToPersonID', 'Quantity'],
            MaxRows: 4000,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(res.Success, `lines: ${res.ErrorMessage ?? 'unknown'}`);
    return res.Results ?? [];
}

async function loadPaymentsFor(
    ctx: IntegrationCheckContext,
    headerIDs: string[],
): Promise<{ lines: PaymentLineRow[]; headers: PaymentHeaderRow[] }> {
    const lineRes = await View(ctx).RunView<PaymentLineRow>(
        {
            EntityName: PAYMENT_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID IN (${IdList(headerIDs)})`,
            Fields: ['ID', 'PaymentHeaderID', 'OrderHeaderID', 'Amount'],
            MaxRows: 4000,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(lineRes.Success, `payment lines: ${lineRes.ErrorMessage ?? 'unknown'}`);
    const lines = lineRes.Results ?? [];
    const payIDs = [...new Set(lines.map((l) => l.PaymentHeaderID))];
    const headRes = await View(ctx).RunView<PaymentHeaderRow>(
        {
            EntityName: PAYMENT_HEADER_ENTITY,
            ExtraFilter: `ID IN (${IdList(payIDs)})`,
            Fields: ['ID', 'PaymentTypeID', 'Amount', 'Status', 'Notes'],
            MaxRows: 4000,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(headRes.Success, `payment headers: ${headRes.ErrorMessage ?? 'unknown'}`);
    return { lines, headers: headRes.Results ?? [] };
}

async function loadEventLines(ctx: IntegrationCheckContext, lineIDs: string[]): Promise<EventLineRow[]> {
    const res = await View(ctx).RunView<EventLineRow>(
        {
            EntityName: EVENT_ORDER_LINE_ENTITY,
            ExtraFilter: `ID IN (${IdList(lineIDs)})`,
            Fields: ['ID', 'PersonID'],
            MaxRows: 2000,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(res.Success, `event lines: ${res.ErrorMessage ?? 'unknown'}`);
    return res.Results ?? [];
}

async function loadSubscriptions(ctx: IntegrationCheckContext, lineIDs: string[]): Promise<SubscriptionRow[]> {
    const res = await View(ctx).RunView<SubscriptionRow>(
        {
            EntityName: SUBSCRIPTION_ENTITY,
            ExtraFilter: `OrderLineID IN (${IdList(lineIDs)})`,
            Fields: ['ID', 'OrderLineID', 'ProductID'],
            MaxRows: 2000,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(res.Success, `subscriptions: ${res.ErrorMessage ?? 'unknown'}`);
    return res.Results ?? [];
}

async function loadTerms(ctx: IntegrationCheckContext, subscriptionIDs: string[]): Promise<TermRow[]> {
    const res = await View(ctx).RunView<TermRow>(
        {
            EntityName: SUBSCRIPTION_TERM_ENTITY,
            ExtraFilter: `SubscriptionID IN (${IdList(subscriptionIDs)})`,
            Fields: ['ID', 'SubscriptionID', 'EndDate', 'TermNumber'],
            MaxRows: 4000,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(res.Success, `terms: ${res.ErrorMessage ?? 'unknown'}`);
    return res.Results ?? [];
}

function isCardOrAch(world: ClientWorld, paymentTypeID: string): boolean {
    const cash = world.PaymentTypes.Cash.ID;
    const check = world.PaymentTypes.Check.ID;
    const wire = world.PaymentTypes.Wire.ID;
    return paymentTypeID !== cash && paymentTypeID !== check && paymentTypeID !== wire;
}

function monthKey(value: string | Date): string {
    const d = new Date(value);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function daysBefore(value: string | Date, days: number): string {
    const d = new Date(value);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
    const out = new Map<string, T[]>();
    for (const row of rows) {
        const k = key(row);
        const list = out.get(k);
        if (list) list.push(row);
        else out.set(k, [row]);
    }
    return out;
}
