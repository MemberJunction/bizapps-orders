import { Injectable } from '@angular/core';
import { Metadata, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { MJO_ENTITIES } from '../data/entity-names';
import { CanPriceOrderLocally, OrderHeaderEntity, OrderPricingService, OrdersPriceOrderOperation, type PreviewComponent, type mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';

/** The entity every order screen binds to. */

/**
 * What the pricing pipeline said about ONE draft line.
 *
 * `Error` is a refusal with a reason — "No price is configured for X" — and it is
 * rendered on the row instead of a number. A missing price must never present as
 * `0.00`: a free line and an unpriced line look identical on screen and only one
 * of them is what the user meant.
 */
export interface MJOLinePrice {
    ClientKey: string;
    /** Quantity × unit price, before this line's own discount. */
    ExtendedAmount: number | null;
    UnitPrice: number | null;
    /** After `DiscountPct`. The figure the line strip shows. */
    NetAmount: number | null;
    PriceListName: string | null;
    /**
     * WHERE the price came from, in the words the badge shows: the price list's name,
     * or `'base price'` when the winning rule belonged to no list. Null ONLY when no
     * price resolved at all.
     *
     * Distinct from `PriceListName` on purpose. The badge treats a null source as
     * "pricing finished and found nothing" and says *no price rule* — so feeding it
     * `PriceListName` labelled every base-priced line as unpriced while showing its
     * resolved price two inches to the left. Caught in the browser on 2026-08-07:
     * both demo products price from base rules, so BOTH read "no price rule".
     */
    PriceSource: string | null;
    /** The resolution walk, so a price can be explained rather than asserted. */
    Components: PreviewComponent[];
    /** True when the user typed the price rather than the engine resolving one. */
    WasStated: boolean;
    Error: string | null;
}

/**
 * What the entry screens may say about an order's money BEFORE it is confirmed.
 *
 * DELIBERATELY INCOMPLETE, and the omissions are the point. There is no
 * `GrossTotal`, no `TaxTotal`, no `ChargeTotal` — charges, tax and promotions are
 * decided inside `OrderEntityServer.Save()` and have no read-only entry point yet.
 * Reporting them as `0` would be a lie that reads as a number, and it is exactly
 * the failure the old pre-flight had (it once showed tax and discount as $0 on the
 * one screen whose whole job is saying what you are about to commit to).
 *
 * So the screens show a NET SUBTOTAL and say what it excludes. The engine remains
 * the authority on what the order actually comes to.
 */
export interface MJOEstimatedTotals {
    ListSubtotal: number;
    DiscountTotal: number;
    NetTotal: number;
    /**
     * What the customer actually pays — net plus charges plus tax.
     *
     * The client could not know this before: only a full booking walk produced it, and the only
     * thing that ran one was a preview inside a transaction that always rolled back. `PriceOrder`
     * returns it from the same engine the booking uses, which is what lets "pay in full" offer the
     * real figure instead of the net subtotal.
     */
    GrossTotal: number;
}

export interface MJOPricingResult {
    Lines: MJOLinePrice[];
    Totals: MJOEstimatedTotals;
    /** True when any line could not be priced — the subtotal is incomplete. */
    HasUnpricedLines: boolean;
}

/** What the last pricing attempt produced. */
export interface MJOPricingState {
    /** Line prices + subtotal, or null before the first successful attempt. */
    Result: MJOPricingResult | null;
    /** A pricing pass is in flight. */
    Loading: boolean;
    /** Why the last attempt failed — the CALL not completing, not a refusal to price. */
    Error: string | null;
}

/**
 * `MJOPricingScheduler` — the seam between a draft and the engine.
 *
 * Every screen that composes an order goes through here, so the debounce, the
 * out-of-order guard and the staleness bookkeeping exist once instead of in each
 * screen that happens to need them.
 *
 * ## How pricing works here, and why it is not a preview
 *
 * This used to call `Orders.PreviewOrder`, which performed a REAL save inside a
 * transaction that always rolled back and read the computed values off the
 * entities before they vanished. It fired on every keystroke, so composing one
 * order ran the full booking walk — journal entries, subscription decisions,
 * entitlement grants, sequence numbers — dozens of times and discarded all of it.
 * And the confirm was gated on the result, so a failure in a run nobody would ever
 * read blocked the run that mattered.
 *
 * It now calls **`Orders.PriceOrder`**, which runs `OrderPricingService` — the same
 * walk `Save()` uses — and writes nothing. `Orders.PreviewPrice` is a one-line
 * wrapper around that same service, not a second resolver.
 *
 * WHY DEBOUNCE AND SEQUENCE-GUARD (unchanged, and still necessary). Pricing is a
 * server round trip fired as the user types. Two things go wrong without care, and
 * both show a wrong number rather than an obvious failure:
 *
 * - **Too many calls.** Un-debounced, every keystroke prices every line.
 * - **Out-of-order responses.** Request 3 can return after request 4. Applying it
 *   would show prices for a draft the user has already moved past — stale money
 *   presented as current. Every response carries the sequence number it was issued
 *   with, and anything not from the newest request is discarded.
 *
 * Provided in root: the debounce state is per-draft, not per-service, so one
 * instance serves the whole app.
 *
 * ## Example
 *
 * ```typescript
 * const order = await md.GetEntityObject<OrderHeaderEntity>(MJO_ENTITIES.OrderHeader);
 * this.stop = draft.Subscribe(() => this.orders.SchedulePricing(draft, s => this.Pricing = s));
 * ```
 */
@Injectable({ providedIn: 'root' })
export class MJOPricingScheduler {
    /** Milliseconds of quiet before a pricing pass fires. */
    public DebounceMs = 350;

    private sequence = 0;
    private applied = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Price a draft's lines after a quiet period, calling back with each state change.
     *
     * Calling again before the timer elapses replaces the pending request rather
     * than queueing another — the user is still typing, and only the final state
     * is worth asking about.
     */
    public SchedulePricing(order: OrderHeaderEntity, onState: (state: MJOPricingState) => void): void {
        if (this.timer) clearTimeout(this.timer);

        // Announce immediately that what is on screen no longer matches the draft,
        // so the strip dims now rather than after the round trip.
        onState({ Result: null, Loading: true, Error: null });

        this.timer = setTimeout(() => {
            void this.PriceNow(order, onState);
        }, this.DebounceMs);
    }

    /**
     * Price a draft's lines immediately, bypassing the debounce.
     *
     * ## Locally when it can, on the server when it must
     *
     * `OrderPricingService` runs in this browser — it lives in the entities package and uses nothing
     * but `RunView`, which is network-transparent. So the common order prices with no round trip at
     * all: the metadata walk reads price rules, tiers, charge types and tax tables through the
     * provider and answers immediately.
     *
     * Two things it cannot do here, and both must ESCALATE rather than be approximated:
     *
     *   · a **pricing plugin**. `BasePriceResolver` subclasses are server-side code, and the class
     *     factory on this tier has none of them registered — so `ResolvePrice` would fall through to
     *     the DEFAULT resolver and return a confident, wrong number. `CanPriceOrderLocally` reads the
     *     `PricingDriverClass` metadata to find out before that happens.
     *   · a **promotion code**. Whether a code still applies depends on redemption counts that change
     *     with orders other people are placing right now. No staleness is acceptable for that, so any
     *     code at all sends the whole pass to the server.
     *
     * The escalation is all-or-nothing because pricing is not per-line arithmetic: promotions stack
     * against order totals, charges apportion across lines, tax computes on the discounted amount. An
     * order half-priced here and half there would disagree with itself about the same totals.
     *
     * Either way the answer comes from ONE implementation, which is the property the whole
     * arrangement exists to preserve.
     */
    public async PriceNow(order: OrderHeaderEntity, onState: (state: MJOPricingState) => void): Promise<void> {
        if (!order.Lines.Count) {
            onState({ Result: null, Loading: false, Error: null });
            return;
        }

        const issued = ++this.sequence;
        try {
            const local = await this.priceLocally(order, issued, onState);
            if (local) return;
            // ONE round trip for the WHOLE order, not one per line.
            //
            // This used to fan out a PreviewPrice call per line and sum the answers, which cannot be
            // right however fast it is: promotions stack against ORDER totals, charges apportion
            // ACROSS lines, and tax computes on the discounted amount. A per-line answer is blind to
            // all three, which is why PreviewPrice's own description calls its result advisory.
            //
            // `Orders.PriceOrder` runs the same OrderPricingService the booking walk runs, so what
            // the screen shows and what the ledger books come from one implementation.
            const op = new OrdersPriceOrderOperation();
            const result = await op.Execute({
                OrderHeaderID: order.ID ?? null,
                CompanyID: order.CompanyID,
                BillToPersonID: order.BillToPersonID ?? null,
                BillToOrganizationID: order.BillToOrganizationID ?? null,
                OrderDate: order.OrderDate ? new Date(order.OrderDate).toISOString() : null,
                ShipToAddressID: order.ShipToAddressID ?? null,
                Lines: order.Lines.Items.map((l) => ({
                    ProductID: l.ProductID,
                    Quantity: Number(l.Quantity ?? 0),
                    // A STATED price is passed through and PINS the line. An absent one is what
                    // tells the engine to resolve — sending 0 would read as a deliberate free line.
                    UnitPrice: l.GetFieldByName('UnitPrice')?.Dirty ? Number(l.UnitPrice) : null,
                    DiscountPct: Number(l.DiscountPct ?? 0),
                })),
                PromotionCodes: order.PromotionCodes.Codes,
            });

            // Discard anything overtaken by a newer request.
            if (issued <= this.applied) return;
            this.applied = issued;

            if (!result.Success || !result.Output?.Success) {
                onState({
                    Result: null,
                    Loading: false,
                    Error: result.Output?.Message ?? result.ErrorMessage ?? 'The order could not be priced.',
                });
                return;
            }
            onState({ Result: this.summarize(order, result.Output), Loading: false, Error: null });
        } catch (e) {
            if (issued <= this.applied) return;
            this.applied = issued;
            onState({
                Result: null,
                Loading: false,
                Error: e instanceof Error ? e.message : String(e),
            });
        }
    }





    /**
     * Run the real pricing walk in this browser, or report that it cannot.
     *
     * @returns True when it priced and reported state; false when the caller must escalate.
     */
    private async priceLocally(
        order: OrderHeaderEntity,
        issued: number,
        onState: (state: MJOPricingState) => void,
    ): Promise<boolean> {
        // A code sends the whole pass to the server: redemption caps and per-customer limits change
        // with orders being placed right now, and there is no staleness that makes a cached answer
        // safe. This is checked first because it is free.
        if (order.PromotionCodes.Codes.length) return false;
        if (!order.CompanyID) return false;

        const md = new Metadata();
        const provider = Metadata.Provider as unknown as IRunViewProvider;

        const verdict = await CanPriceOrderLocally(
            order.Lines.Items.map((l) => l.ProductID),
            order.CompanyID,
            provider,
            md.CurrentUser,
        );
        if (!verdict.CanPriceLocally) return false;

        // REAL LINE ENTITIES, NEVER SAVED — the same shape `Orders.PriceOrder` builds server-side,
        // because it is the same walk. `NewRecord()` is called and `Save()` is not.
        const lines: mjBizAppsOrdersOrderLineEntity[] = [];
        for (const source of order.Lines.Items) {
            const line = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(MJO_ENTITIES.OrderLine);
            line.NewRecord();
            line.ProductID = source.ProductID;
            line.Quantity = Number(source.Quantity ?? 0);
            // A STATED price PINS the line; an absent one is what tells the engine to resolve.
            // Assigning 0 would read as a deliberate free line.
            if (source.GetFieldByName('UnitPrice')?.Dirty) line.UnitPrice = Number(source.UnitPrice);
            line.DiscountPct = Number(source.DiscountPct ?? 0);
            lines.push(line);
        }

        const result = await new OrderPricingService({
            Provider: Metadata.Provider as unknown as IMetadataProvider,
            User: md.CurrentUser as UserInfo,
        }).Price({
            OrderHeaderID: order.ID ?? null,
            CompanyID: order.CompanyID,
            BillToPersonID: order.BillToPersonID ?? null,
            BillToOrganizationID: order.BillToOrganizationID ?? null,
            OrderDate: order.OrderDate ?? null,
            ShipToAddressID: order.ShipToAddressID ?? null,
            Lines: lines,
            PromotionCodes: [],
            ManualDiscounts: [],
            Charges: [],
        });

        if (issued <= this.applied) return true; // overtaken, but it WAS handled
        this.applied = issued;

        // Read back off the entities the walk just stamped — the same fields `Orders.PriceOrder`
        // reads before returning, so the two paths produce the same summary from the same numbers.
        const priced = lines.map((line, i) => ({
            UnitPrice: Number(line.UnitPrice ?? 0),
            DiscountAmount: Number(line.DiscountAmount ?? 0),
            LineTotalNet: Math.round((Number(line.Quantity ?? 0) * Number(line.UnitPrice ?? 0) - Number(line.DiscountAmount ?? 0)) * 100) / 100,
            Components: result.PriceComponents.get(line)?.Components?.map((c) => ({
                Kind: String((c as { Kind?: string }).Kind ?? ''),
                Label: String((c as { Label?: string }).Label ?? ''),
                Amount: Number((c as { Amount?: number }).Amount ?? 0),
            })),
            TaxExemptReason: result.TaxReasons.get(i) ?? null,
        }));
        const sum = (pick: (l: (typeof priced)[number]) => number) =>
            Math.round(priced.reduce((t, l) => t + pick(l), 0) * 100) / 100;

        onState({
            Result: this.summarize(order, {
                Lines: priced,
                Totals: {
                    Net: sum((l) => l.LineTotalNet),
                    Discount: sum((l) => l.DiscountAmount),
                    Gross: sum((l) => l.LineTotalNet),
                },
            }),
            Loading: false,
            Error: null,
        });
        return true;
    }

    /**
     * Turn the engine's answer into what the strip renders.
     *
     * Totals come from the SERVER's figures rather than being re-added here. Summing on the client
     * is how the screen and the ledger drift: the engine apportions discounts and charges across
     * lines with its own rounding, and a second addition in a different order lands a penny out.
     */
    private summarize(
        order: OrderHeaderEntity,
        out: {
            Lines: Array<{
                UnitPrice: number; DiscountAmount: number; LineTotalNet: number;
                Components?: Array<{ Kind: string; Label: string; Amount: number }>;
                TaxExemptReason?: string | null;
            }>;
            Totals: { Net: number; Discount: number; Gross: number };
        },
    ): MJOPricingResult {
        const lines: MJOLinePrice[] = out.Lines.map((priced, i) => {
            const line = order.Lines.Items[i];
            const stated = line?.GetFieldByName('UnitPrice')?.Dirty === true;
            const extended = round(Number(priced.UnitPrice) * Number(line?.Quantity ?? 0));
            return {
                // Positional: an unsaved line has no id, and the engine answers by position.
                ClientKey: line?.ID ?? String(i),
                ExtendedAmount: extended,
                UnitPrice: Number(priced.UnitPrice),
                NetAmount: Number(priced.LineTotalNet),
                PriceListName: null,
                Error: null,
                // Null means "priced and found nothing", which the badge renders as *no price rule*.
                // A resolved price with no list is base pricing, and must not read as unpriced.
                PriceSource: priced.UnitPrice > 0 ? (stated ? 'stated' : 'base price') : null,
                Components: (priced.Components ?? []) as unknown as PreviewComponent[],
                WasStated: stated,
            };
        });

        return {
            Lines: lines,
            Totals: {
                ListSubtotal: round(out.Totals.Net + out.Totals.Discount),
                DiscountTotal: round(out.Totals.Discount),
                NetTotal: round(out.Totals.Net),
                GrossTotal: round(out.Totals.Gross),
            },
            HasUnpricedLines: lines.some((l) => l.UnitPrice === null || l.UnitPrice === 0),
        };
    }

    public CancelPending(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }
}

/** Round to cents the way the engine does, so client and server agree on the last penny. */
function round(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
