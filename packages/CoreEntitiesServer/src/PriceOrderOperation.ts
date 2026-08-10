/**
 * @fileoverview `Orders.PriceOrder` — what a whole order comes to, persisting nothing.
 *
 * THE ONE RULE THAT MATTERS, same as `Orders.PreviewPrice`: this runs the REAL pipeline. It calls
 * `OrderPricingService`, which is precisely what `OrderEntityServer.Save()` calls before it books.
 * There is no second implementation to drift, which is the only way the number on the screen and
 * the number in the ledger stay the same.
 *
 * WHY IT EXISTS ALONGSIDE `PreviewPrice`. That operation answers for ONE product and says so in its
 * own description — its answer is advisory, because promotions stack against ORDER totals, charges
 * apportion ACROSS lines, and tax computes on the discounted amount rather than list price. A
 * per-line preview cannot see any of that. This one can.
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
import { OrderPricingService } from '@mj-biz-apps/orders-entities';

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
    DiscountAmount: number;
    ChargeAmount: number;
    LineTax: number;
    LineTotalNet: number;
    LineTotalGross: number;
    Components?: Array<{ Kind: string; Label: string; Amount: number }>;
    TaxExemptReason?: string | null;
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
                ManualDiscounts: (input.ManualDiscounts ?? []) as never,
                Charges: (input.Charges ?? []) as never,
            });

            const priced: PricedLine[] = lines.map((line, i) => {
                const gross = Math.round(Number(line.Quantity ?? 0) * Number(line.UnitPrice ?? 0) * 100) / 100;
                const discount = Number(line.DiscountAmount ?? 0);
                const charge = Number(line.ChargeAmount ?? 0);
                const tax = Number(line.LineTax ?? 0);
                const net = Math.round((gross - discount) * 100) / 100;
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
                        Kind: String((c as { Kind?: string }).Kind ?? ''),
                        Label: String((c as { Label?: string }).Label ?? ''),
                        Amount: Number((c as { Amount?: number }).Amount ?? 0),
                    })),
                    TaxExemptReason: result.TaxReasons.get(i) ?? null,
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
 * Force the class registration. Tree-shaking removes a class nobody imports, and the decorator only
 * runs if the module is loaded — so the server's bootstrap calls this.
 */
export function LoadPriceOrderOperation(): void {
    // no-op by design
}
