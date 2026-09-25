/**
 * ReversalResolver — finds the line a reversal unwinds, and how much of it is already gone.
 *
 * The server half of `ReversalBehavior`: this does the lookups, that does the judging. Same split
 * as `PriceResolver`/`PricingBehavior` and for the same reason — the rule about how much may be
 * returned is provable without a database, and only finding the rows needs one.
 *
 * ALREADY-REVERSED IS A SUM ACROSS ORDERS, not a flag on the line. A customer may send back two of
 * four units in March and two more in June, on separate return orders. Each of those is individually
 * within the original, so a guard that reads one reversal at a time passes both — and a third one
 * too. Only the running total against the origin catches it.
 *
 * DRAFT AND VOIDED RETURNS DO NOT COUNT. A draft that never confirms would otherwise hold the
 * customer's allowance hostage, and a voided one already gave it back.
 *
 * CONNECTS TO:
 *   PURE:   ./ReversalBehavior.ts
 *   CALLER: OrderEntityServer.savePendingLines (before pricing — see there for why)
 */
import { IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
import type { OriginTaxCharge, ReversalOrigin } from './ReversalBehavior.js';
import { ScheduledCompanyIDs, type ScheduleTimingFacts } from './PaymentScheduleBehavior.js';
import { ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY } from './entity-names.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const ORDER_CHARGE_ENTITY = 'MJ_BizApps_Orders: Order Charges';
const ORDER_CHARGE_ALLOCATION_ENTITY = 'MJ_BizApps_Orders: Order Charge Allocations';
const CHARGE_TYPE_ENTITY = 'MJ_BizApps_Orders: Charge Types';

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The origin line plus what prior reversals have already taken from it. */
export interface ReversalContext {
    Origin: ReversalOrigin;
    AlreadyReversed: number;
}

/**
 * Load the origin line for `reversesOrderLineID` and total the reversals already booked against it.
 *
 * Returns `null` when the origin does not exist — the caller refuses, rather than treating a
 * dangling pointer as "no constraint". A reversal pointing at nothing is the case where every
 * guard in `ReversalBehavior` would otherwise pass vacuously.
 */
export async function LoadReversalContext(
    reversesOrderLineID: string,
    provider: IMetadataProvider,
    user: UserInfo,
    /** IDs to exclude from the already-reversed total — the reversal line being validated, on a re-save. */
    excludeLineIDs: string[] = [],
): Promise<ReversalContext | null> {
    // A FORMAT CHECK ON AN INTERPOLATED ID. Everything reaching here comes from our own columns, so
    // this is not the last line of defence against injection — but it is free, it turns a malformed
    // pointer into a clear refusal instead of a SQL syntax error from inside a booking transaction,
    // and it means the filter below cannot be built from arbitrary text. Raised by Marcelo on PR #17.
    if (!UUID_PATTERN.test(reversesOrderLineID)) {
        throw new Error(
            `'${reversesOrderLineID}' is not a valid order line identifier, so the line it claims to ` +
                `reverse cannot be looked up.`,
        );
    }

    const rv = new RunView(provider as unknown as IRunViewProvider);

    type LineRow = {
        ID: string;
        OrderHeaderID: string;
        CompanyID?: string | null;
        ProductID: string;
        Quantity: number;
        UnitPrice: number;
        DiscountPct: number;
        DiscountAmount: number;
        ServicePeriodStart?: Date | string | null;
        ServicePeriodEnd?: Date | string | null;
        SubscriptionID?: string | null;
        LineTax?: number | null;
        ShipToAddressID?: string | null;
        ShipToAddressSnapshot?: string | null;
    };

    // The origin and every reversal already pointing at it, in ONE view. Splitting them costs a
    // round trip and buys nothing — both are order lines and both are needed.
    const lines = await rv.RunView<LineRow>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `ID = '${reversesOrderLineID}' OR ReversesOrderLineID = '${reversesOrderLineID}'`,
            ResultType: 'simple',
        },
        user,
    );

    const rows = lines?.Results ?? [];
    const origin = rows.find((r) => String(r.ID).toLowerCase() === reversesOrderLineID.toLowerCase());
    if (!origin) return null;
    const priors = rows.filter((r) => r !== origin);

    // The order-line view does not carry its header's Status, and the status is what decides
    // whether a prior reversal counts — so the headers have to be fetched. One view, not one per.
    const statusByOrder = new Map<string, string>();
    if (priors.length) {
        const ids = [...new Set(priors.map((p) => `'${p.OrderHeaderID}'`))].join(',');
        const headers = await rv.RunView<{ ID: string; Status: string; OrderNumber: string | null }>(
            {
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter: `ID IN (${ids})`,
                ResultType: 'simple',
            },
            user,
        );
        for (const h of headers?.Results ?? []) {
            statusByOrder.set(String(h.ID).toLowerCase(), String(h.Status ?? ''));
        }
    }

    // THE TERM IS THE AUTHORITY ON WHICH SUBSCRIPTION THIS LINE BOUGHT, not the line's own
    // `SubscriptionID`. That column is a FORWARD link added later for the confirm pre-flight to read,
    // and it is only populated on lines written since — an order line from before it existed, or one
    // whose subscription was attached by any path that does not stamp it, carries NULL while its term
    // sits there naming the subscription correctly. `SubscriptionTerm.OrderLineID` is NOT NULL and is
    // written by the same step that creates the term, so it is the link that is always there.
    const terms = await rv.RunView<{ SubscriptionID: string; OrderLineID: string }>(
        {
            EntityName: SUBSCRIPTION_TERM_ENTITY,
            ExtraFilter: `OrderLineID = '${reversesOrderLineID}'`,
            ResultType: 'simple',
        },
        user,
    );
    const subscriptionID = terms?.Results?.[0]?.SubscriptionID ?? origin.SubscriptionID ?? null;

    const excluded = new Set(excludeLineIDs.map((id) => id.toLowerCase()));
    let alreadyReversed = 0;
    for (const prior of priors) {
        if (excluded.has(String(prior.ID).toLowerCase())) continue;
        // A Draft return has not taken anything yet and a Voided one has given it back. Anything
        // else — Confirmed, Posted, Fulfilled — is money the customer already has. An UNKNOWN
        // status counts: a prior reversal whose header could not be read is not evidence of room.
        const status = statusByOrder.get(String(prior.OrderHeaderID).toLowerCase()) ?? '';
        if (status === 'Draft' || status === 'Voided') continue;
        // `ABS` because reversal quantities are stored negative, and a signed sum here would let a
        // reversal and a re-sale cancel out into a fresh allowance.
        alreadyReversed += Math.abs(Number(prior.Quantity ?? 0));
    }

    return {
        Origin: {
            ID: origin.ID,
            ProductID: origin.ProductID,
            Quantity: Number(origin.Quantity ?? 0),
            UnitPrice: Number(origin.UnitPrice ?? 0),
            DiscountPct: Number(origin.DiscountPct ?? 0),
            DiscountAmount: Number(origin.DiscountAmount ?? 0),
            OrderNumber: null,
            OrderHeaderID: origin.OrderHeaderID,
            CompanyID: origin.CompanyID ?? null,
            ShipToAddressID: origin.ShipToAddressID ?? null,
            ShipToAddressSnapshot: origin.ShipToAddressSnapshot ?? null,
            LineTax: Number(origin.LineTax ?? 0),
            // The coverage window the origin actually sold — for a subscription that is the SETTLED
            // term, which `materializeSubscriptions` stamped back onto the line, so the anchoring and
            // proration the type applied are already baked in here and need no re-deriving.
            ServicePeriodStart: origin.ServicePeriodStart ? new Date(origin.ServicePeriodStart) : null,
            ServicePeriodEnd: origin.ServicePeriodEnd ? new Date(origin.ServicePeriodEnd) : null,
            SubscriptionID: subscriptionID,
        },
        AlreadyReversed: Math.round(alreadyReversed * 1e4) / 1e4,
    };
}

/**
 * The Tax-category charges allocated to an origin line — what the sale collected, per jurisdiction.
 *
 * A failed read THROWS rather than returning nothing: an empty list reads as "the sale charged no
 * tax", and the return would then book without a tax refund and balance while doing it.
 */
export async function LoadOriginTaxCharges(
    originLineID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<OriginTaxCharge[]> {
    if (!UUID_PATTERN.test(originLineID)) {
        throw new Error(`'${originLineID}' is not a valid order line identifier, so its tax cannot be looked up.`);
    }
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const read = async <T>(entity: string, filter: string, fields: string[]): Promise<T[]> => {
        const res = await rv.RunView<T>({ EntityName: entity, ExtraFilter: filter, Fields: fields, ResultType: 'simple' }, user);
        if (!res?.Success) {
            throw new Error(`Could not read the tax charged on order line ${originLineID}: ${res?.ErrorMessage ?? 'unknown error'}`);
        }
        return res.Results ?? [];
    };

    const allocations = await read<{ OrderChargeID: string; Amount: number }>(
        ORDER_CHARGE_ALLOCATION_ENTITY,
        `OrderLineID = '${originLineID}'`,
        ['OrderChargeID', 'Amount'],
    );
    if (!allocations.length) return [];

    const charges = await read<{ ID: string; ChargeTypeID: string; TaxJurisdictionID: string | null; TaxRateID: string | null }>(
        ORDER_CHARGE_ENTITY,
        `ID IN (${[...new Set(allocations.map((a) => `'${a.OrderChargeID}'`))].join(',')})`,
        ['ID', 'ChargeTypeID', 'TaxJurisdictionID', 'TaxRateID'],
    );
    const types = await read<{ ID: string; Code: string; Category: string }>(
        CHARGE_TYPE_ENTITY,
        `ID IN (${[...new Set(charges.map((c) => `'${c.ChargeTypeID}'`))].join(',')})`,
        ['ID', 'Code', 'Category'],
    );

    const key = (id: string): string => String(id).toLowerCase();
    const typeByID = new Map(types.map((t) => [key(t.ID), t]));
    const chargeByID = new Map(charges.map((c) => [key(c.ID), c]));
    const out: OriginTaxCharge[] = [];
    for (const a of allocations) {
        const charge = chargeByID.get(key(a.OrderChargeID));
        const type = charge ? typeByID.get(key(charge.ChargeTypeID)) : undefined;
        if (!charge || type?.Category !== 'Tax') continue;
        out.push({
            Code: type.Code,
            Amount: Number(a.Amount ?? 0),
            TaxJurisdictionID: charge.TaxJurisdictionID ?? null,
            TaxRateID: charge.TaxRateID ?? null,
        });
    }
    return out;
}

/**
 * Was the origin line's company billed by instalment on its order (D92)?
 *
 * A company on instalments credits Sales Tax Payable one slice at a time, as each instalment is
 * invoiced, so the tax recorded on its lines is the whole contract's and not what reached the
 * ledger. Refunding a share of it debits tax that was never credited. The test is the ledger's own,
 * `ScheduledCompanyIDs`, so a return and the booking cannot disagree about which lines were billed
 * this way. A failed read throws: guessing "not scheduled" refunds tax that was never invoiced.
 */
export async function OriginBilledByInstalment(
    origin: Pick<ReversalOrigin, 'OrderHeaderID' | 'CompanyID'>,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<boolean> {
    if (!origin.OrderHeaderID || !origin.CompanyID) return false;
    if (!UUID_PATTERN.test(origin.OrderHeaderID)) {
        throw new Error(`'${origin.OrderHeaderID}' is not a valid order identifier, so its payment schedule cannot be read.`);
    }
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<ScheduleTimingFacts>(
        {
            EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
            ExtraFilter: `OrderHeaderID = '${origin.OrderHeaderID}'`,
            Fields: ['CompanyID', 'Status', 'DueDate', 'Amount'],
            ResultType: 'simple',
        },
        user,
    );
    if (!res?.Success) {
        throw new Error(
            `Could not read the payment schedule of the order being reversed: ${res?.ErrorMessage ?? 'unknown error'}`,
        );
    }
    return ScheduledCompanyIDs(res.Results ?? []).has(String(origin.CompanyID).toLowerCase());
}
