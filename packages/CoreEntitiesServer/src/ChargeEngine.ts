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
 *   DOC:    plans/pricing-charges-and-promotions.md §5
 */
import { BaseEntity, IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
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
 * Write the charge rows and their allocations.
 *
 * Runs after the lines exist, and only ADDS rows — the frozen line is never touched again, which is
 * what keeps this clear of the immutability trigger.
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
        const row = await provider.GetEntityObject<BaseEntity>(ORDER_CHARGE_ENTITY, user);
        row.NewRecord();
        row.Set('OrderHeaderID', orderHeaderID);
        row.Set('ChargeTypeID', charge.Request.ChargeTypeID);
        row.Set('Amount', charge.Amount);
        row.Set('BasisAmount', charge.BasisAmount);
        if (charge.Request.Rate != null) row.Set('Rate', charge.Request.Rate);
        row.Set('Sequence', charge.Request.Sequence);
        if (charge.Request.TaxJurisdictionID) row.Set('TaxJurisdictionID', charge.Request.TaxJurisdictionID);
        if (charge.Request.TaxRateID) row.Set('TaxRateID', charge.Request.TaxRateID);
        if (charge.IsOverridden) {
            row.Set('IsOverridden', true);
            // ComputedAmount is what the rules said. Recording it is the whole difference between
            // "we waived this" and "this was always free".
            row.Set('ComputedAmount', charge.ComputedAmount);
            row.Set('OverrideReason', charge.Request.OverrideReason);
            row.Set('OverriddenByUserID', userID);
            row.Set('OverriddenAt', new Date());
        }
        if (!(await row.Save())) {
            throw new ChargeError(
                `Could not record charge '${charge.Request.Code}': ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }

        for (const alloc of charge.Allocations) {
            const lineID = lineIDFor(alloc.LineID);
            if (!lineID) continue;
            const a = await provider.GetEntityObject<BaseEntity>(ORDER_CHARGE_ALLOCATION_ENTITY, user);
            a.NewRecord();
            a.Set('OrderChargeID', row.Get('ID'));
            a.Set('OrderLineID', lineID);
            a.Set('Amount', alloc.Amount);
            if (!(await a.Save())) {
                throw new ChargeError(
                    `Could not allocate charge '${charge.Request.Code}' to its line: ` +
                        `${a.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
    }
}
