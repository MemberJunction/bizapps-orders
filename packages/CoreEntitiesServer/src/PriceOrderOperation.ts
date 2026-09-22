/**
 * @fileoverview `Orders.PriceOrder` — what a whole order comes to, persisting nothing.
 *
 * THE ONE RULE THAT MATTERS: this runs `OrderPricingService`, which is precisely what
 * `OrderEntityServer.Save()` and `Orders.PreviewPrice` call. There is no second implementation to
 * drift, which is the only way the number on the screen and the number in the ledger stay the same.
 *
 * WHY IT EXISTS ALONGSIDE `PreviewPrice`. That operation is a one-line call to the same service and
 * reports one SKU's unit price. This one prices the whole header — promotions, charges, tax.
 *
 * WHAT IT REPLACED. An earlier `Orders.PreviewOrder` ran the REAL save inside a transaction that
 * always rolled back, then read the computed values off the entities before they vanished. The
 * reasoning was sound — a preview that reimplements pricing is a second copy of the rules — but the
 * cost was not: it fired on every keystroke, so composing one order ran the full booking walk
 * (journal entries, subscription decisions, entitlement grants, sequence numbers) dozens of times
 * and discarded all of it, and the confirm was GATED on it. Extracting the pricing walk is what
 * makes the honest version cheap: the decide step without the write.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import {
    BaseRemotableOperation,
    Metadata,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { RequireOptionalUUID, RequireUUID } from './sql-guards.js';
import { NetAfterDiscount, OrderPricingService, type ResolvedPrice } from '@mj-biz-apps/orders-entities';
import { MarkAsOrdersOwnWrite } from './OrderLineEntityServer.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

interface PriceOrderInput {
    OrderHeaderID?: string | null;
    CompanyID: string;
    BillToPersonID?: string | null;
    BillToOrganizationID?: string | null;
    OrderDate?: string | null;
    ShipToAddressID?: string | null;
    Lines: Array<{
        ProductID: string;
        Quantity: number;
        UnitPrice?: number | null;
        DiscountPct?: number | null;
        ServicePeriodStart?: string | null;
        ServicePeriodEnd?: string | null;
    }>;
    PromotionCodes?: string[];
    ManualDiscounts?: Array<{ LineIndex: number; Amount?: number | null; Percent?: number | null; Reason: string }>;
    Charges?: Array<{ Code: string; Amount?: number | null; Rate?: number | null; TargetLineIndex?: number | null }>;
}

interface PricedLine {
    ProductID: string;
    Quantity: number;
    UnitPrice: number;
    /** The line's WHOLE discount — the percentage concession and the allocated amount together. */
    DiscountAmount: number;
    ChargeAmount: number;
    LineTax: number;
    LineTotalNet: number;
    LineTotalGross: number;
    Components?: Array<{ Kind: string; Label: string; Amount: number }>;
    TaxExemptReason?: string | null;
    ProductPriceID?: string | null;
    Default?: { UnitPrice: number; ProductPriceID: string | null; PriceName: string | null } | null;
}

interface PriceOrderOutput {
    Success: boolean;
    Message?: string | null;
    Lines: PricedLine[];
    Totals: { Net: number; Discount: number; Charges: number; Tax: number; Gross: number };
    UnusableCodes: Array<{ Code: string; Reason: string }>;
}

@RegisterClass(BaseRemotableOperation, 'Orders.PriceOrder')
export class PriceOrderOperation extends BaseRemotableOperation<PriceOrderInput, PriceOrderOutput> {
    public OperationKey = 'Orders.PriceOrder';

    protected async InternalExecute(
        input: PriceOrderInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<PriceOrderOutput> {
        const empty = { Lines: [], Totals: { Net: 0, Discount: 0, Charges: 0, Tax: 0, Gross: 0 }, UnusableCodes: [] };

        if (!input?.CompanyID) return { Success: false, Message: 'CompanyID is required.', ...empty };
        if (!input.Lines?.length) return { Success: false, Message: 'At least one line is required.', ...empty };

        // Caller-supplied ids reach SQL filter text downstream. Validated at the boundary so every
        // frame below can trust them.
        RequireUUID(input.CompanyID, 'CompanyID');
        RequireOptionalUUID(input.OrderHeaderID, 'OrderHeaderID');
        RequireOptionalUUID(input.BillToPersonID, 'BillToPersonID');
        RequireOptionalUUID(input.BillToOrganizationID, 'BillToOrganizationID');
        RequireOptionalUUID(input.ShipToAddressID, 'ShipToAddressID');
        input.Lines.forEach((l, i) => RequireUUID(l.ProductID, `Lines[${i}].ProductID`));

        // REAL LINE ENTITIES, NEVER SAVED.
        //
        // The pricing walk reads and writes OrderLine entities — that is what it does for the booking
        // path, and reusing it verbatim is the entire point. So the input is materialised into
        // entities, priced, and read back. `NewRecord()` is called and `Save()` never is.
        const md = new Metadata();
        const lines: mjBizAppsOrdersOrderLineEntity[] = [];
        for (const spec of input.Lines) {
            const line = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
            // Orders writing its own line. An app that froze this line freezes what a PERSON
            // may change, not Orders closing its own books (#206 item 1).
            MarkAsOrdersOwnWrite(line);
            line.NewRecord();
            line.ProductID = spec.ProductID;
            line.Quantity = Number(spec.Quantity ?? 0);
            // An absent UnitPrice must stay UNTOUCHED so the engine resolves one. Assigning 0 would
            // look like a deliberate free line and suppress resolution — a silently free order.
            if (spec.UnitPrice != null) line.UnitPrice = spec.UnitPrice;
            line.DiscountPct = spec.DiscountPct ?? 0;
            if (spec.ServicePeriodStart) line.ServicePeriodStart = new Date(spec.ServicePeriodStart);
            if (spec.ServicePeriodEnd) line.ServicePeriodEnd = new Date(spec.ServicePeriodEnd);
            lines.push(line);
        }

        try {
            const result = await new OrderPricingService({ Provider: provider, User: user }).Price({
                OrderHeaderID: input.OrderHeaderID ?? null,
                CompanyID: input.CompanyID,
                BillToPersonID: input.BillToPersonID ?? null,
                BillToOrganizationID: input.BillToOrganizationID ?? null,
                OrderDate: input.OrderDate ?? null,
                ShipToAddressID: input.ShipToAddressID ?? null,
                Lines: lines,
                PromotionCodes: input.PromotionCodes ?? [],
                // `LineIndex` IS THE LINE, and it has to be translated.
                //
                // The walk keys lines positionally, and the engine's request shape names its target
                // as `OrderLineID` — so handing it this input's rows unchanged passed a `LineIndex`
                // under a field the engine reads as an id. It matched nothing, and an unmatched
                // line-level discount became an ORDER-LEVEL one spread pro-rata across every line: a
                // different discount from the one asked for, applied without complaint. A negative
                // index is how a caller says "the whole order", which is what an absent target means.
                ManualDiscounts: (input.ManualDiscounts ?? []).map((d) => ({
                    OrderLineID: d.LineIndex >= 0 ? String(d.LineIndex) : null,
                    Amount: d.Amount ?? null,
                    Percent: d.Percent ?? null,
                    Reason: d.Reason,
                })),
                Charges: (input.Charges ?? []) as never,
                // The editor asks this on every edit and needs the rules' answer for a pinned line
                // too — it is what tells an override apart from a restatement of the default.
                IncludeDefaultsForStatedLines: true,
            });

            const priced: PricedLine[] = lines.map((line, i) => {
                const gross = Math.round(Number(line.Quantity ?? 0) * Number(line.UnitPrice ?? 0) * 100) / 100;
                // BOTH discount fields, through the SAME function the line and the journal entry use.
                //
                // This read `gross - DiscountAmount` and ignored `DiscountPct` outright, so a line
                // carrying a percentage concession was quoted on screen at a figure the ledger would
                // never book — `OrderLineEntityServer.computeTotals` applies the percentage, and the
                // journal entry mirrors it. The two could only disagree, and nothing reported it:
                // the entry still balances, the order still saves, and only the number the customer
                // was shown is wrong. Converted orders carry the field today, so this was already
                // live before anything in the product could set it.
                const pct = Math.round(Number(line.DiscountPct ?? 0) * 1e4) / 1e4;
                const charge = Number(line.ChargeAmount ?? 0);
                const tax = Number(line.LineTax ?? 0);
                const net = NetAfterDiscount(gross, pct, Number(line.DiscountAmount ?? 0));
                const discount = Math.round((gross - net) * 100) / 100;
                return {
                    ProductID: line.ProductID,
                    Quantity: Number(line.Quantity ?? 0),
                    UnitPrice: Number(line.UnitPrice ?? 0),
                    DiscountAmount: discount,
                    ChargeAmount: charge,
                    LineTax: tax,
                    LineTotalNet: net,
                    LineTotalGross: Math.round((net + charge + tax) * 100) / 100,
                    Components: result.PriceComponents.get(line)?.Components?.map((c) => ({
                        Kind: String((c as { ComponentType?: string }).ComponentType ?? ''),
                        Label: String((c as { Label?: string }).Label ?? ''),
                        Amount: Number((c as { Amount?: number }).Amount ?? 0),
                    })),
                    TaxExemptReason: result.TaxReasons.get(i) ?? null,
                    ProductPriceID: result.PriceComponents.get(line)?.ProductPriceID ?? null,
                    Default: engineDefault(result.EngineDefaults.get(line)),
                };
            });

            const sum = (pick: (l: PricedLine) => number) =>
                Math.round(priced.reduce((t, l) => t + pick(l), 0) * 100) / 100;

            return {
                Success: true,
                Lines: priced,
                Totals: {
                    Net: sum((l) => l.LineTotalNet),
                    Discount: sum((l) => l.DiscountAmount),
                    Charges: sum((l) => l.ChargeAmount),
                    Tax: sum((l) => l.LineTax),
                    Gross: sum((l) => l.LineTotalGross),
                },
                UnusableCodes: result.UnusableCodes,
            };
        } catch (err) {
            // A pricing failure is an ANSWER here, not a crash: the screen asks this on every edit,
            // and "this cannot be priced, because X" is what the user needs to see.
            return {
                Success: false,
                Message: err instanceof Error ? err.message : String(err),
                ...empty,
            };
        }
    }
}

/**
 * The engine default as the wire carries it: absent when the walk was not asked, null when it was
 * asked and no rule priced the product.
 */
function engineDefault(
    resolved: ResolvedPrice | null | undefined,
): PricedLine['Default'] {
    if (resolved === undefined) return undefined;
    if (resolved === null) return null;
    return {
        UnitPrice: resolved.UnitPrice,
        ProductPriceID: resolved.ProductPriceID,
        PriceName: resolved.PriceName ?? null,
    };
}

/**
 * Force the class registration. Tree-shaking removes a class nobody imports, and the decorator only
 * runs if the module is loaded — so the server's bootstrap calls this.
 */
export function LoadPriceOrderOperation(): void {
    // no-op by design
}
