/**
 * @fileoverview The order decomposition — computed in ONE place.
 *
 * WHY THIS IS ITS OWN MODULE. Two operations answer "what does this order come
 * to": `SaveOrder`/`PreviewOrder` project it for the entry rail, and
 * `PreviewConfirm` shows it on the pre-flight before someone commits. Those are
 * the same question, and for a while they had two answers — the pre-flight
 * carried placeholder zeros for discount, charge and tax while reporting a real
 * gross. A pre-flight that understates tax as $0 is worse than one that shows
 * nothing: it reads as a decomposition and it is a guess.
 *
 * Sharing the function is what makes the two surfaces agree by construction
 * rather than by anyone remembering to update both.
 *
 * THE HEADER IS THE AUTHORITY FOR GROSS, and the lines for everything else. The
 * gross rollup is trigger-maintained and is the number every other screen shows,
 * so re-summing it here would create a second opinion about the one figure a
 * customer actually pays.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import type { BaseEntity } from '@memberjunction/core';
import type {
    OrderLineResult,
    OrderTotalsResult,
    TaxLayerResult,
} from '@mj-biz-apps/orders-entities';

import type { HydratedOrder } from './OrderDraftHydrator.js';

/** Round to cents, avoiding the float representation error at the halfway point. */
const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** Read a field off an entity whose generated type is not in scope here. */
function field<T>(entity: BaseEntity, name: string, fallback: T): T {
    const value = (entity as unknown as Record<string, unknown>)[name];
    return (value ?? fallback) as T;
}

function isoOrNull(value: unknown): string | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Project the line rows and the totals decomposition from a hydrated order.
 *
 * Runs a single pass because the per-line figures and the rollups are the same
 * arithmetic — splitting them would mean walking the lines twice and inviting the
 * two walks to disagree.
 *
 * @param hydrated An order whose lines carry engine-computed amounts. Call this
 *   AFTER the save, or the line totals are still zero.
 * @returns The line projections and the decomposition over them.
 */
export function ComputeLinesAndTotals(hydrated: HydratedOrder): {
    Lines: OrderLineResult[];
    Totals: OrderTotalsResult;
} {
    const order = hydrated.Order as unknown as BaseEntity;
    const lines: OrderLineResult[] = [];

    let listSubtotal = 0;
    let discountTotal = 0;
    let taxableGoods = 0;
    let untaxableGoods = 0;

    const byCompany = new Map<string, { Net: number; Charges: number; Tax: number }>();

    for (let i = 0; i < hydrated.Lines.length; i++) {
        const line = hydrated.Lines[i] as unknown as BaseEntity;
        const net = money(field(line, 'LineTotalNet', 0));
        const tax = money(field(line, 'LineTax', 0));
        const charge = money(field(line, 'ChargeAmount', 0));
        const gross = money(field(line, 'LineTotalGross', net + tax + charge));
        const qty = Number(field(line, 'Quantity', 0));
        const unit = money(field(line, 'UnitPrice', 0));
        const discountAmount = money(field(line, 'DiscountAmount', 0));
        const discountPct = Number(field(line, 'DiscountPct', 0));
        const listAmount = money(qty * unit);
        const companyID = field(line, 'CompanyID', '');
        const taxable = tax !== 0;

        listSubtotal += listAmount;
        discountTotal += discountAmount;
        if (taxable) taxableGoods += net;
        else untaxableGoods += net;

        const bucket = byCompany.get(companyID) ?? { Net: 0, Charges: 0, Tax: 0 };
        bucket.Net += net;
        bucket.Charges += charge;
        bucket.Tax += tax;
        byCompany.set(companyID, bucket);

        lines.push({
            ClientKey: hydrated.LineKeys[i],
            LineNumber: Number(field(line, 'LineNumber', i + 1)),
            ProductID: field(line, 'ProductID', ''),
            ProductName: field(line, 'Product', ''),
            CompanyID: companyID,
            CompanyName: field(line, 'Company', ''),
            Quantity: qty,
            UnitPrice: unit,
            ProductPriceID: field<string | null>(line, 'ProductPriceID', null),
            // The client stated it iff it sent one. The hydrator records this at
            // the only moment it is knowable — afterwards a stated $40 and a
            // resolved $40 are the same number on the same field.
            UnitPriceWasStated: hydrated.LineUnitPriceWasStated[i] ?? false,
            // Provenance, and it must be non-null whenever we actually know it. A rule-resolved
            // price used to report `null` here, which the UI renders as an hourglass "resolving…"
            // badge — sitting next to a perfectly correct price. It reads as a hung request on
            // every line the engine priced, which is the common case.
            //
            // `ProductPriceID` is the answer: OrderEntityServer stamps it with the rule that
            // produced the number precisely so a disputed invoice can be traced back. If it is
            // set, a price rule resolved this line; null with no stated price means nothing
            // resolved it, which is the only case that genuinely has no source.
            PriceSource: hydrated.LineUnitPriceWasStated[i]
                ? 'Stated'
                : field<string | null>(line, 'ProductPriceID', null)
                  ? 'Price rule'
                  : null,
            DiscountPct: discountPct,
            DiscountAmount: discountAmount,
            ListAmount: listAmount,
            LineTotalNet: net,
            ChargeAmount: charge,
            LineTax: tax,
            LineTotalGross: gross,
            Taxable: taxable,
            TaxLayers: [] as TaxLayerResult[],
            ServicePeriodStart: isoOrNull(field<unknown>(line, 'ServicePeriodStart', null)),
            ServicePeriodEnd: isoOrNull(field<unknown>(line, 'ServicePeriodEnd', null)),
            RequiresFulfillment: field<string | null>(line, 'FulfillmentStatus', null) !== null,
            Components: [],
        });
    }

    const chargeTotal = money(lines.reduce((s, l) => s + l.ChargeAmount, 0));
    const taxTotal = money(lines.reduce((s, l) => s + l.LineTax, 0));
    const netTotal = money(lines.reduce((s, l) => s + l.LineTotalNet, 0));

    const companyNames = new Map<string, string>();
    for (const l of lines) companyNames.set(l.CompanyID, l.CompanyName);

    const totals: OrderTotalsResult = {
        ListSubtotal: money(listSubtotal),
        DiscountTotal: money(discountTotal),
        NetTotal: netTotal,
        ChargeTotal: chargeTotal,
        TaxTotal: taxTotal,
        // Read the header's rollup rather than summing again: it is trigger-maintained
        // and is the number every other surface will show.
        GrossTotal: money(field(order, 'TotalGross', netTotal + chargeTotal + taxTotal)),
        TaxableBase: {
            TaxableGoods: money(taxableGoods),
            UntaxableGoods: money(untaxableGoods),
            NonTaxCharges: chargeTotal,
            Base: money(taxableGoods + chargeTotal),
        },
        ByCompany: [...byCompany.entries()].map(([id, b]) => ({
            CompanyID: id,
            CompanyName: companyNames.get(id) ?? '',
            Net: money(b.Net),
            Charges: money(b.Charges),
            Tax: money(b.Tax),
            Gross: money(b.Net + b.Charges + b.Tax),
        })),
    };

    return { Lines: lines, Totals: totals };
}
