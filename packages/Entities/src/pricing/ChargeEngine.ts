/**
 * ChargeEngine — load charge types, compute charges, and write what they did (plan D71).
 *
 * The arithmetic is in `ChargeBehavior`; this is the half that needs a database: what a charge type
 * is, what basis it computes on, and where its rows go.
 *
 * WHERE CHARGES LAND ON THE LINE
 *   - Tax-category charges → `OrderLine.LineTax`
 *   - everything else      → `OrderLine.ChargeAmount`
 *
 * Both are charges to the engine that computes them, and both flow into `LineTotalGross` the same
 * way. They are stored apart because tax is reported, remitted and audited separately in every
 * jurisdiction, and merging them would mean unpicking the two again at exactly the moment it
 * matters most.
 *
 * CONNECTS TO:
 *   PURE:   ./ChargeBehavior.ts
 *   CALLER: OrderEntityServer (after promotions, before booking)
 *   DOC:    plans/archive/pricing-charges-and-promotions.md §5
 */
import { BaseEntity, IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
import {
    mjBizAppsOrdersOrderChargeAllocationEntity,
    mjBizAppsOrdersOrderChargeEntity,
} from '../generated/entity_subclasses';
import { LoadOrdersEngine, OrdersEngine } from './OrdersEngine.js';
import {
    ComputeCharges,
    type ChargeableLine,
    type ChargeBasis,
    type ChargeCategory,
    type ChargeRequest,
    type ComputeChargesResult,
} from './ChargeBehavior.js';

const CHARGE_TYPE_ENTITY = 'MJ_BizApps_Orders: Charge Types';
const ORDER_CHARGE_ENTITY = 'MJ_BizApps_Orders: Order Charges';
const ORDER_CHARGE_ALLOCATION_ENTITY = 'MJ_BizApps_Orders: Order Charge Allocations';

export class ChargeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ChargeError';
    }
}

/** What a caller asks for: a charge type code, and an amount or a rate. */
export interface RequestedCharge {
    /** `ChargeType.Code` — 'Shipping', 'SalesTax', … */
    Code: string;
    /** When set, the charge belongs to this line alone rather than being spread across the order. */
    TargetLineID?: string | null;
    Amount?: number | null;
    Rate?: number | null;
    TaxJurisdictionID?: string | null;
    TaxRateID?: string | null;
    /** Replaces the computed amount. Requires a reason — the DB CHECK enforces that too. */
    OverrideAmount?: number | null;
    OverrideReason?: string | null;
    /** Provenance of an override restated from a saved row — see {@link ReadStatedTaxCharges}. */
    OverriddenByUserID?: string | null;
    OverriddenAt?: Date | null;
}

interface ChargeTypeRow {
    ID: string;
    Code: string;
    Category: ChargeCategory;
    Basis: ChargeBasis;
    Sequence: number;
    AllowsOverride: boolean;
    IsActive: boolean;
}

/** Resolve requested charges against their types and compute them. */
export async function RunCharges(
    requested: RequestedCharge[],
    lines: ChargeableLine[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ComputeChargesResult> {
    if (!requested.length || !lines.length) {
        return { Charges: [], PerLine: new Map(), TotalCharges: 0 };
    }

    // DELIBERATELY NOT SERVED FROM `OrdersEngine`, and the `BypassCache` is not superstition.
    //
    // Charge types are a seeded lookup and look like an obvious cache candidate. `Basis` is the
    // exception that rules them out: whether tax computes on the goods alone or on the goods plus
    // shipping is JURISDICTION-DEPENDENT CONFIGURATION that a caller may set for the order it is
    // about to price, inside the same transaction. A process-wide cache cannot see that write, so it
    // would price the order on the previous basis — a tax figure that is plausible, balanced, and
    // wrong by the shipping.
    //
    // This is the boundary of what the engine cache is for: rows nobody changes mid-transaction.
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const codes = [...new Set(requested.map((r) => r.Code))].map((c) => `'${c.replace(/'/g, "''")}'`).join(',');
    const res = await rv.RunView<ChargeTypeRow>(
        { EntityName: CHARGE_TYPE_ENTITY, ExtraFilter: `Code IN (${codes})`, ResultType: 'simple', BypassCache: true },
        user,
    );
    if (!res?.Success) {
        throw new ChargeError(`Could not read charge types: ${res?.ErrorMessage ?? 'unknown error'}`);
    }
    const byCode = new Map((res.Results ?? []).map((t) => [t.Code.toLowerCase(), t]));

    const chargeRequests: ChargeRequest[] = requested.map((r) => {
        const type = byCode.get(r.Code.toLowerCase());
        if (!type) {
            throw new ChargeError(
                `There is no charge type '${r.Code}'. Charge types are seeded metadata — add one before charging it.`,
            );
        }
        if (!type.IsActive) {
            throw new ChargeError(`Charge type '${r.Code}' is inactive and cannot be applied.`);
        }
        if (r.OverrideAmount != null) {
            if (!type.AllowsOverride) {
                throw new ChargeError(`Charge type '${r.Code}' does not permit an override.`);
            }
            if (!r.OverrideReason?.trim()) {
                // Mirrors the DB CHECK. Caught here so the message names the charge rather than a
                // constraint number.
                throw new ChargeError(
                    `Overriding charge '${r.Code}' requires a reason. 'Waived' and 'free' must stay ` +
                        `distinguishable in the record.`,
                );
            }
        }
        return {
            ChargeTypeID: type.ID,
            TargetLineID: r.TargetLineID ?? null,
            Code: type.Code,
            Category: type.Category,
            Basis: type.Basis,
            Sequence: type.Sequence,
            Amount: r.Amount ?? null,
            Rate: r.Rate ?? null,
            TaxJurisdictionID: r.TaxJurisdictionID ?? null,
            TaxRateID: r.TaxRateID ?? null,
            OverrideAmount: r.OverrideAmount ?? null,
            OverrideReason: r.OverrideReason ?? null,
            OverriddenByUserID: r.OverriddenByUserID ?? null,
            OverriddenAt: r.OverriddenAt ?? null,
        };
    });

    return ComputeCharges(chargeRequests, lines);
}

/** Per line, split into the tax and non-tax buckets the two columns want. */
export function SplitChargesByLine(result: ComputeChargesResult): Map<string, { Tax: number; Other: number }> {
    const out = new Map<string, { Tax: number; Other: number }>();
    for (const charge of result.Charges) {
        for (const alloc of charge.Allocations) {
            const cur = out.get(alloc.LineID) ?? { Tax: 0, Other: 0 };
            if (charge.Request.Category === 'Tax') cur.Tax = Math.round((cur.Tax + alloc.Amount) * 100) / 100;
            else cur.Other = Math.round((cur.Other + alloc.Amount) * 100) / 100;
            out.set(alloc.LineID, cur);
        }
    }
    return out;
}

/**
 * Remove the tax rows an earlier save wrote for these lines, allocations first.
 *
 * Tax is the one charge the pricing walk RE-DERIVES on every save: it is resolved from the ship-to
 * address each time, while a requested charge is stated once and never restated. So the walk that
 * is about to call {@link WriteCharges} would add a second set of tax rows beside the draft's, the
 * line's `LineTax` would show one set, and booking — which credits tax from these rows — would
 * credit it twice and refuse an entry that does not balance. Clearing them first leaves exactly
 * the set this walk decided.
 *
 * Scoped to the lines the walk priced, not the whole order, so a save that saw only some of the
 * lines cannot strip tax from the rest. A tax charge with an allocation on one of them goes whole,
 * all its allocations with it, because the walk re-decides it whole.
 *
 * Only for an order whose money is not yet frozen; the caller owns that rule.
 */
export async function DeleteTaxCharges(
    orderHeaderID: string,
    lineIDs: string[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<void> {
    if (!lineIDs.length) return;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const types = await rv.RunView<{ ID: string }>(
        { EntityName: CHARGE_TYPE_ENTITY, ExtraFilter: `Category = 'Tax'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
        user,
    );
    if (!types?.Success) {
        throw new ChargeError(`Could not read charge types: ${types?.ErrorMessage ?? 'unknown error'}`);
    }
    if (!types.Results.length) return;

    const touched = await rv.RunView<{ OrderChargeID: string }>(
        {
            EntityName: ORDER_CHARGE_ALLOCATION_ENTITY,
            ExtraFilter: `OrderLineID IN (${quoted(lineIDs)})`,
            Fields: ['OrderChargeID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!touched?.Success) {
        throw new ChargeError(`Could not read the lines' charge allocations: ${touched?.ErrorMessage ?? 'unknown error'}`);
    }
    // A tax charge that came to nothing has no allocation at all — a waiver, or a jurisdiction that
    // rates the product at zero — so no line leads to it. The walk re-decides it like any other, so
    // it goes too, or each re-price leaves another zero row behind.
    const unallocated = await zeroTaxChargesWithoutAllocations(orderHeaderID, types.Results.map((t) => t.ID), rv, user);
    const chargeIDs = [...touched.Results.map((a) => a.OrderChargeID), ...unallocated];
    if (!chargeIDs.length) return;

    const charges = await rv.RunView<mjBizAppsOrdersOrderChargeEntity>(
        {
            EntityName: ORDER_CHARGE_ENTITY,
            ExtraFilter:
                `OrderHeaderID = '${orderHeaderID}'` +
                ` AND ID IN (${quoted(chargeIDs)})` +
                ` AND ChargeTypeID IN (${quoted(types.Results.map((t) => t.ID))})`,
            ResultType: 'entity_object',
            BypassCache: true,
        },
        user,
    );
    if (!charges?.Success) {
        throw new ChargeError(`Could not read the order's tax charges: ${charges?.ErrorMessage ?? 'unknown error'}`);
    }
    if (!charges.Results.length) return;

    const allocations = await rv.RunView<mjBizAppsOrdersOrderChargeAllocationEntity>(
        {
            EntityName: ORDER_CHARGE_ALLOCATION_ENTITY,
            ExtraFilter: `OrderChargeID IN (${quoted(charges.Results.map((c) => c.ID))})`,
            ResultType: 'entity_object',
            BypassCache: true,
        },
        user,
    );
    if (!allocations?.Success) {
        throw new ChargeError(`Could not read the order's tax allocations: ${allocations?.ErrorMessage ?? 'unknown error'}`);
    }

    for (const row of [...allocations.Results, ...charges.Results]) {
        if (!(await row.Delete())) {
            throw new ChargeError(
                `Could not remove the previous tax on this order: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }
}

/** The order's zero-amount tax charges that have no allocation rows. */
async function zeroTaxChargesWithoutAllocations(
    orderHeaderID: string,
    taxTypeIDs: string[],
    rv: RunView,
    user: UserInfo,
): Promise<string[]> {
    const zero = await rv.RunView<{ ID: string }>(
        {
            EntityName: ORDER_CHARGE_ENTITY,
            ExtraFilter: `OrderHeaderID = '${orderHeaderID}' AND ChargeTypeID IN (${quoted(taxTypeIDs)}) AND Amount = 0`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!zero?.Success) {
        throw new ChargeError(`Could not read the order's zero tax charges: ${zero?.ErrorMessage ?? 'unknown error'}`);
    }
    if (!zero.Results.length) return [];
    const allocated = await rv.RunView<{ OrderChargeID: string }>(
        {
            EntityName: ORDER_CHARGE_ALLOCATION_ENTITY,
            ExtraFilter: `OrderChargeID IN (${quoted(zero.Results.map((c) => c.ID))})`,
            Fields: ['OrderChargeID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!allocated?.Success) {
        throw new ChargeError(`Could not read the zero tax allocations: ${allocated?.ErrorMessage ?? 'unknown error'}`);
    }
    const has = new Set(allocated.Results.map((a) => a.OrderChargeID.toLowerCase()));
    return zero.Results.map((c) => c.ID).filter((id) => !has.has(id.toLowerCase()));
}

/**
 * The tax charges a caller STATED on this saved order, read back as requests for the next walk.
 *
 * A stated tax (a rate or amount, or an override with its reason) wins over the tax resolved from
 * the ship-to address, but it reaches the walk only as a request in memory. A later save of the
 * same draft — the confirm, typically from a reloaded order — does not restate it, so the walk
 * resolved tax from the address and {@link DeleteTaxCharges} replaced the stated rows with it. A
 * waived tax came back at confirm.
 *
 * Which rows were stated is read off the row: an overridden charge, or one with no `TaxRateID`.
 * Resolution writes every layer with the rate row it chose and never overrides, so neither can be a
 * resolved row. Rows on a reversal line are skipped: those mirror the origin's tax and the walk
 * re-derives them itself.
 *
 * A charge whose allocations sit on one line of a several-line order is restated against that line;
 * otherwise it is spread across the order again. Nothing is restated when the caller states a tax of
 * its own on this walk, which replaces the earlier one.
 *
 * @param lineIDs the walk's lines in walk order, `null` for a line not yet saved; a restated
 * charge's target is the position here.
 */
export async function ReadStatedTaxCharges(
    orderHeaderID: string,
    lineIDs: Array<string | null>,
    skipLineIDs: string[],
    requestedCodes: string[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<RequestedCharge[]> {
    const position = new Map<string, number>();
    lineIDs.forEach((id, i) => {
        if (id) position.set(id.toLowerCase(), i);
    });
    if (!position.size) return [];
    const skip = new Set(skipLineIDs.map((id) => id.toLowerCase()));

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const types = await rv.RunView<{ ID: string; Code: string }>(
        { EntityName: CHARGE_TYPE_ENTITY, ExtraFilter: `Category = 'Tax'`, Fields: ['ID', 'Code'], ResultType: 'simple', BypassCache: true },
        user,
    );
    if (!types?.Success) {
        throw new ChargeError(`Could not read charge types: ${types?.ErrorMessage ?? 'unknown error'}`);
    }
    if (!types.Results.length) return [];
    const codeOf = new Map(types.Results.map((t) => [t.ID.toLowerCase(), t.Code]));
    const taxCodes = new Set(types.Results.map((t) => t.Code.toLowerCase()));
    if (requestedCodes.some((c) => taxCodes.has(c.toLowerCase()))) return [];

    const charges = await rv.RunView<mjBizAppsOrdersOrderChargeEntity>(
        {
            EntityName: ORDER_CHARGE_ENTITY,
            ExtraFilter:
                `OrderHeaderID = '${orderHeaderID}'` +
                ` AND ChargeTypeID IN (${quoted(types.Results.map((t) => t.ID))})` +
                ` AND (IsOverridden = 1 OR TaxRateID IS NULL)`,
            OrderBy: 'Sequence',
            ResultType: 'entity_object',
            BypassCache: true,
        },
        user,
    );
    if (!charges?.Success) {
        throw new ChargeError(`Could not read the order's stated tax: ${charges?.ErrorMessage ?? 'unknown error'}`);
    }
    if (!charges.Results.length) return [];

    const allocations = await rv.RunView<{ OrderChargeID: string; OrderLineID: string }>(
        {
            EntityName: ORDER_CHARGE_ALLOCATION_ENTITY,
            ExtraFilter: `OrderChargeID IN (${quoted(charges.Results.map((c) => c.ID))})`,
            Fields: ['OrderChargeID', 'OrderLineID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!allocations?.Success) {
        throw new ChargeError(`Could not read the stated tax allocations: ${allocations?.ErrorMessage ?? 'unknown error'}`);
    }
    const linesOf = new Map<string, string[]>();
    for (const a of allocations.Results) {
        const key = a.OrderChargeID.toLowerCase();
        linesOf.set(key, [...(linesOf.get(key) ?? []), a.OrderLineID.toLowerCase()]);
    }

    const out: RequestedCharge[] = [];
    for (const row of charges.Results) {
        const allocated = linesOf.get(row.ID.toLowerCase()) ?? [];
        const onLines = allocated.filter((id) => position.has(id));
        // A charge that came to nothing (a full waiver, a zero rate) has no allocation to say where it
        // pointed, so it is restated across the order. One whose allocations were all on lines since
        // removed is not a request any more; nor is a reversal line's mirrored tax.
        const zero = !allocated.length && Number(row.Amount) === 0;
        if ((!onLines.length && !zero) || onLines.some((id) => skip.has(id))) continue;
        const code = codeOf.get(row.ChargeTypeID.toLowerCase());
        if (!code) continue;
        const rate = row.Rate == null ? null : Number(row.Rate);
        const overridden = !!row.IsOverridden;
        out.push({
            Code: code,
            TargetLineID: onLines.length === 1 && lineIDs.length > 1 ? String(position.get(onLines[0])) : null,
            Rate: rate,
            Amount: rate != null ? null : Number(overridden ? (row.ComputedAmount ?? 0) : row.Amount),
            TaxJurisdictionID: row.TaxJurisdictionID ?? null,
            TaxRateID: row.TaxRateID ?? null,
            ...(overridden
                ? {
                      OverrideAmount: Number(row.Amount),
                      OverrideReason: row.OverrideReason ?? null,
                      OverriddenByUserID: row.OverriddenByUserID ?? null,
                      OverriddenAt: row.OverriddenAt ?? null,
                  }
                : {}),
        });
    }
    return out;
}

/** Database-issued IDs as a SQL `IN` list, each once. */
function quoted(ids: string[]): string {
    return [...new Set(ids)].map((id) => `'${id}'`).join(',');
}

/**
 * Write the charge rows and their allocations.
 *
 * Runs after the lines exist, and only ADDS rows — the frozen line is never touched again, which is
 * what keeps this clear of the immutability trigger. A re-priced order clears its earlier tax rows
 * with {@link DeleteTaxCharges} first.
 */
export async function WriteCharges(
    orderHeaderID: string,
    result: ComputeChargesResult,
    lineIDFor: (positionalID: string) => string | null,
    userID: string | null,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<void> {
    for (const charge of result.Charges) {
        const row = await provider.GetEntityObject<mjBizAppsOrdersOrderChargeEntity>(ORDER_CHARGE_ENTITY, user);
        row.NewRecord();
        row.OrderHeaderID = orderHeaderID;
        row.ChargeTypeID = charge.Request.ChargeTypeID;
        row.Amount = charge.Amount;
        row.BasisAmount = charge.BasisAmount;
        if (charge.Request.Rate != null) row.Rate = charge.Request.Rate;
        row.Sequence = charge.Request.Sequence;
        if (charge.Request.TaxJurisdictionID) row.TaxJurisdictionID = charge.Request.TaxJurisdictionID;
        if (charge.Request.TaxRateID) row.TaxRateID = charge.Request.TaxRateID;
        if (charge.IsOverridden) {
            row.IsOverridden = true;
            // ComputedAmount is what the rules said. Recording it is the whole difference between
            // "we waived this" and "this was always free".
            row.ComputedAmount = charge.ComputedAmount;
            row.OverrideReason = charge.Request.OverrideReason;
            row.OverriddenByUserID = userID;
            row.OverriddenAt = new Date();
            // A restated override keeps who made it and when; a re-price is not a new decision.
            if (charge.Request.OverriddenByUserID) row.OverriddenByUserID = charge.Request.OverriddenByUserID;
            if (charge.Request.OverriddenAt) row.OverriddenAt = charge.Request.OverriddenAt;
        }
        if (!(await row.Save())) {
            throw new ChargeError(
                `Could not record charge '${charge.Request.Code}': ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }

        for (const alloc of charge.Allocations) {
            const lineID = lineIDFor(alloc.LineID);
            if (!lineID) continue;
            const a = await provider.GetEntityObject<mjBizAppsOrdersOrderChargeAllocationEntity>(ORDER_CHARGE_ALLOCATION_ENTITY, user);
            a.NewRecord();
            a.OrderChargeID = row.ID;
            a.OrderLineID = lineID;
            a.Amount = alloc.Amount;
            if (!(await a.Save())) {
                throw new ChargeError(
                    `Could not allocate charge '${charge.Request.Code}' to its line: ` +
                        `${a.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
    }
}
