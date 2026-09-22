import { Injectable } from '@angular/core';
import { Metadata, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { MJO_ENTITIES } from '../data/entity-names';
import { CanPriceOrderLocally, NetAfterDiscount, OrderHeaderEntity, OrderPricingService, OrdersPriceOrderOperation, type PreviewComponent, type ResolvedPrice, type mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { anyFieldIsDirty } from '@mj-biz-apps/orders-entities';

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
    /**
     * What came OFF this line — the percentage concession and the allocated amount together.
     *
     * Reported so the card can say a discount was given rather than only showing a smaller total.
     * A price that is simply lower and a price that was discounted are different facts, and only
     * the second one is discounting (golive #252).
     */
    DiscountAmount: number;
    UnitPrice: number | null;
    /** After `DiscountPct`. The figure the line strip shows. */
    NetAmount: number | null;
    PriceListName: string | null;
    /**
     * WHERE the price came from, in the words the badge shows: the NAME of the rule that
     * won — `'Member 195'` — falling back to `'base price'` when the walk returned no
     * component to name. Null ONLY when no price resolved at all.
     *
     * It read `'base price'` unconditionally until 2026-09-10, which was not merely vague
     * but wrong: a line priced off a member list was labelled as base-priced, which a
     * finance user checking an order against a contract would read as proof the list did
     * not apply. The name was already on the client — `PriceResolver` emits it as the
     * winning component's `Label` — and was being discarded here (golive #194).
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
    /** The rule that produced `UnitPrice`; null when the price was stated or no rule applied. */
    ProductPriceID: string | null;
    /**
     * What the rules say for this line whether or not its price is pinned — the engine's default.
     *
     * This is the answer the override editor compares against: it is what the picker's Default row
     * restores, and a pick or a typed amount that lands on it is not an override at all. Null when
     * no rule prices the product; undefined when the pricing pass did not report one.
     */
    Default?: MJOEngineDefault | null;
    Error: string | null;
}

/** The engine's default for a line, as `Orders.PriceOrder` reports it. */
export interface MJOEngineDefault {
    UnitPrice: number;
    ProductPriceID: string | null;
    PriceName: string | null;
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
                    UnitPrice: anyFieldIsDirty(l, ['UnitPrice']) ? Number(l.UnitPrice) : null,
                    DiscountPct: Number(l.DiscountPct ?? 0),
                })),
                PromotionCodes: order.PromotionCodes.Codes,
                ManualDiscounts: StagedManualDiscounts(order),
                // KNOWN ASYMMETRY: this operation's input has no field for a discount the line
                // ALREADY carries, so a saved order re-priced on this path shows its staged requests
                // but not its stored concessions. The local walk above is handed the stored figure
                // and does show both. Escalation happens only when a promotion code or a pricing
                // plugin is in play, and closing the gap means a wire change to `Orders.PriceOrder`.
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
            if (anyFieldIsDirty(source, ['UnitPrice'])) line.UnitPrice = Number(source.UnitPrice);
            line.DiscountPct = Number(source.DiscountPct ?? 0);
            // The discount the line ALREADY carries comes across too. Without it a saved order
            // reopened on screen priced as though its concessions had never been granted, and a new
            // one staged on the same line would then read as the only discount there is.
            line.DiscountAmount = Number(source.DiscountAmount ?? 0);
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
            ManualDiscounts: StagedManualDiscounts(order).map((d) => ({
                // The walk keys lines positionally here, because these copies were never saved.
                OrderLineID: d.LineIndex >= 0 ? String(d.LineIndex) : null,
                Amount: d.Amount,
                Reason: d.Reason,
            })),
            Charges: [],
            // The editor needs the rules' answer for a pinned line too — see `MJOLinePrice.Default`.
            IncludeDefaultsForStatedLines: true,
        });

        if (issued <= this.applied) return true; // overtaken, but it WAS handled
        this.applied = issued;

        // Read back off the entities the walk just stamped — the same fields `Orders.PriceOrder`
        // reads before returning, so the two paths produce the same summary from the same numbers.
        const priced = lines.map((line, i) => {
            const gross = Math.round(Number(line.Quantity ?? 0) * Number(line.UnitPrice ?? 0) * 100) / 100;
            // Through `NetAfterDiscount`, exactly as `Orders.PriceOrder` now does — the whole point
            // of this file is that the local walk and the remote one are the same walk, and this was
            // the one place they had each written the subtraction out by hand. Both had dropped
            // `DiscountPct`, so a line carrying a percentage concession quoted above what it books.
            const pct = Math.round(Number(line.DiscountPct ?? 0) * 1e4) / 1e4;
            const net = NetAfterDiscount(gross, pct, Number(line.DiscountAmount ?? 0));
            return {
                UnitPrice: Number(line.UnitPrice ?? 0),
                DiscountAmount: Math.round((gross - net) * 100) / 100,
                LineTotalNet: net,
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
                ProductPriceID?: string | null;
                Default?: MJOEngineDefault | null;
            }>;
            Totals: { Net: number; Discount: number; Gross: number };
        },
    ): MJOPricingResult {
        const lines: MJOLinePrice[] = out.Lines.map((priced, i) => {
            const line = order.Lines.Items[i];
            const stated =
                (line ? anyFieldIsDirty(line, ['UnitPrice']) : false) ||
                line?.GetFieldByName('PriceOverridden')?.Value === true ||
                line?.GetFieldByName('PriceOverridden')?.Value === 1;
            const extended = round(Number(priced.UnitPrice) * Number(line?.Quantity ?? 0));
            return {
                // Positional: an unsaved line has no id, and the engine answers by position.
                ClientKey: line?.ID ?? String(i),
                ExtendedAmount: extended,
                DiscountAmount: Number(priced.DiscountAmount ?? 0),
                UnitPrice: Number(priced.UnitPrice),
                NetAmount: Number(priced.LineTotalNet),
                PriceListName: null,
                Error: null,
                // Null means "priced and found nothing", which the badge renders as *no price rule*.
                // A resolved price with no list is base pricing, and must not read as unpriced.
                PriceSource: priced.UnitPrice > 0 ? (stated ? 'stated' : (WinningRuleLabel(priced.Components) ?? 'base price')) : null,
                Components: (priced.Components ?? []) as unknown as PreviewComponent[],
                WasStated: stated,
                ProductPriceID: priced.ProductPriceID ?? null,
                Default: priced.Default,
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

/**
 * The component that NAMES the price, out of the walk's decomposition.
 *
 * `Base` is what `DefaultPriceResolver` emits for the ProductPrice row that won
 * (`PriceResolver.ts`), and `Rule` is what a pricing plugin emits for the same job.
 * Everything after them — adjustment, charge, tax — describes what happened TO the
 * price, not where it came from, so none of those may label the line.
 *
 * Selected by TYPE rather than by position because position is not a contract: the
 * order of the decomposition is the resolver's business and a plugin may prepend to it.
 *
 * @returns The rule's name, or null when nothing in the walk names one.
 */
export function WinningRuleLabel(components?: ReadonlyArray<{ Kind: string; Label: string }>): string | null {
    const hit = components?.find((c) => c.Kind === 'Base' || c.Kind === 'Rule');
    return hit?.Label?.trim() || null;
}

/**
 * The engine default as the local walk reports it, in the shape the wire uses: undefined when the
 * walk was not asked, null when it was asked and no rule priced the product.
 */
function engineDefault(resolved: ResolvedPrice | null | undefined): MJOEngineDefault | null | undefined {
    if (resolved === undefined) return undefined;
    if (resolved === null) return null;
    return { UnitPrice: resolved.UnitPrice, ProductPriceID: resolved.ProductPriceID, PriceName: resolved.PriceName ?? null };
}

/**
 * The discounts staged on an order but not yet saved, keyed by LINE POSITION.
 *
 * A discount composed on screen lives as an unsaved row on `Order.Adjustments` — the same channel
 * `OrderEntityServer` drains at save time, so the figure previewed here and the figure booked come
 * from one request rather than two descriptions of it. Position rather than key because both
 * pricing walks build their own throwaway line objects in this order and answer positionally; a
 * negative index means the request names no line, which is an order-level discount.
 *
 * A row naming a line the order no longer has is dropped rather than sent: the engine refuses an
 * unknown line, and a line removed after its discount was staged is a screen-state problem, not
 * something to fail an order over.
 */
export function StagedManualDiscounts(
    order: OrderHeaderEntity,
): Array<{ LineIndex: number; Amount: number | null; Percent: number | null; Reason: string }> {
    const staged = order.Adjustments.Items.filter((a) => !a.IsSaved);
    if (!staged.length) return [];

    const positionOf = new Map<string, number>();
    order.Lines.Items.forEach((line, index) => {
        if (line.ID) positionOf.set(String(line.ID).toLowerCase(), index);
    });

    const requests: Array<{ LineIndex: number; Amount: number | null; Percent: number | null; Reason: string }> = [];
    for (const row of staged) {
        if (!row.OrderLineID) {
            requests.push({ LineIndex: -1, Amount: row.Amount ?? null, Percent: null, Reason: row.Reason ?? '' });
            continue;
        }
        const index = positionOf.get(String(row.OrderLineID).toLowerCase());
        if (index === undefined) continue;
        requests.push({ LineIndex: index, Amount: row.Amount ?? null, Percent: null, Reason: row.Reason ?? '' });
    }
    return requests;
}

/** Round to cents the way the engine does, so client and server agree on the last penny. */
function round(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
