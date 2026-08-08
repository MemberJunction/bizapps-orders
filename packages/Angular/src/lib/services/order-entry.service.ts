import { Injectable } from '@angular/core';
import {
    OrderDraft,
    OrderDraftLine,
    OrdersConfirmOrderOperation,
    OrdersPreviewPriceOperation,
    OrdersSaveOrderOperation,
    type OrdersConfirmOrderOutput,
    type OrdersSaveOrderOutput,
    type PreviewComponent,
} from '@mj-biz-apps/orders-entities';
import type { MJOOrderRow, MJOOrdersDataService } from './orders-data.service';

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
 * `MJOOrderEntryService` — the seam between a draft and the engine.
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
 * It now calls **`Orders.PreviewPrice`**, once per line. That operation calls
 * `ResolvePrice` — the same function the pricing walk inside `Save()` calls — and
 * writes nothing. So this is not a second implementation of pricing that could
 * drift; it is the same implementation, invoked without the write.
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
 * const draft = new OrderDraft({ CompanyID });
 * this.stop = draft.Subscribe(() => this.orders.SchedulePricing(draft, s => this.Pricing = s));
 * ```
 */
@Injectable({ providedIn: 'root' })
export class MJOOrderEntryService {
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
    public SchedulePricing(draft: OrderDraft, onState: (state: MJOPricingState) => void): void {
        if (this.timer) clearTimeout(this.timer);

        // Announce immediately that what is on screen no longer matches the draft,
        // so the strip dims now rather than after the round trip.
        onState({ Result: null, Loading: true, Error: null });

        this.timer = setTimeout(() => {
            void this.PriceNow(draft, onState);
        }, this.DebounceMs);
    }

    /** Price a draft's lines immediately, bypassing the debounce. */
    public async PriceNow(draft: OrderDraft, onState: (state: MJOPricingState) => void): Promise<void> {
        if (!draft.LineCount) {
            onState({ Result: null, Loading: false, Error: null });
            return;
        }

        const issued = ++this.sequence;
        try {
            // One round trip per line, run concurrently. Sequential would make a
            // five-line order feel five times slower for no isolation benefit —
            // each call is independent and reads nothing the others write.
            const priced = await Promise.all(draft.Lines.map((line) => this.priceLine(draft, line)));

            // Discard anything overtaken by a newer request.
            if (issued <= this.applied) return;
            this.applied = issued;

            onState({ Result: this.summarize(priced), Loading: false, Error: null });
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
     * Resolve one line's price.
     *
     * A STATED price short-circuits the call. Direct entry wins over every resolved
     * price at save time (`OrderDraftHydrator`: an absent `UnitPrice` is what tells
     * the engine to resolve one), so asking the server what a line would cost when
     * the user has already said what it costs would show a number the save will not
     * use.
     */
    private async priceLine(draft: OrderDraft, line: OrderDraftLine): Promise<MJOLinePrice> {
        const discount = Number(line.DiscountPct ?? 0);
        const net = (extended: number): number => round(extended * (1 - discount));

        if (line.UnitPriceWasStated) {
            const extended = round(Number(line.UnitPrice) * line.Quantity);
            return {
                ClientKey: line.ClientKey,
                UnitPrice: Number(line.UnitPrice),
                ExtendedAmount: extended,
                NetAmount: net(extended),
                PriceListName: null,
                PriceSource: null,
                Components: [],
                WasStated: true,
                Error: null,
            };
        }

        const unpriced = (message: string): MJOLinePrice => ({
            ClientKey: line.ClientKey,
            UnitPrice: null,
            ExtendedAmount: null,
            NetAmount: null,
            PriceListName: null,
            PriceSource: null,
            Components: [],
            WasStated: false,
            Error: message,
        });

        if (!line.ProductID) return unpriced('Pick a product.');

        const op = new OrdersPreviewPriceOperation();
        const result = await op.Execute({
            ProductID: line.ProductID,
            Quantity: line.Quantity,
            OrganizationID: draft.Header.BillToOrganizationID ?? null,
            PersonID: draft.Header.BillToPersonID ?? null,
        });

        // TWO `Success` FLAGS, AND THE OUTER ONE IS NOT THE ANSWER.
        // `RemoteOpResult.Success` means the operation EXECUTED; the domain outcome
        // is `Output.Success`. A product with no price rule comes back as a
        // successful call carrying a refusal, and reporting that as a price is how
        // an unpriced line becomes a silent $0.00.
        if (!result.Success) return unpriced(result.ErrorMessage ?? 'The price could not be resolved.');
        const output = result.Output;
        if (!output?.Success) return unpriced(output?.Message ?? 'No price is configured for this product.');

        const extended = round(Number(output.ExtendedAmount ?? 0));
        return {
            ClientKey: line.ClientKey,
            UnitPrice: output.UnitPrice ?? null,
            ExtendedAmount: extended,
            NetAmount: net(extended),
            PriceListName: output.PriceListName ?? null,
            // A resolved price ALWAYS has a source. A rule that belongs to no list is a
            // base rule — which is a real answer, not a missing one.
            PriceSource: output.PriceListName ?? 'base price',
            Components: output.Components ?? [],
            WasStated: false,
            Error: null,
        };
    }

    /** Roll the per-line answers into the subtotal the screens show. */
    private summarize(lines: MJOLinePrice[]): MJOPricingResult {
        let list = 0;
        let net = 0;
        for (const line of lines) {
            list += line.ExtendedAmount ?? 0;
            net += line.NetAmount ?? 0;
        }
        return {
            Lines: lines,
            Totals: {
                ListSubtotal: round(list),
                DiscountTotal: round(list - net),
                NetTotal: round(net),
            },
            HasUnpricedLines: lines.some((l) => l.Error !== null),
        };
    }

    /** Persist a draft. Never confirms — confirming is a separate, deliberate step. */
    public async Save(draft: OrderDraft): Promise<OrdersSaveOrderOutput | null> {
        const op = new OrdersSaveOrderOperation();
        const result = await op.Execute({ Draft: draft.ToInput() });
        if (!result.Success || !result.Output?.Success) {
            // SAY WHY. Returning null made a refused save indistinguishable from a
            // successful one that had nothing to report — the button appeared to
            // work and no order existed. A save that fails silently is the worst
            // outcome available on an order screen.
            const reason =
                result.Output?.Blockers?.map((b) => b.Message).join(' ') ||
                result.Output?.Message ||
                result.ErrorMessage ||
                'The order could not be saved.';
            console.error(`[MJOOrderEntryService] SaveOrder refused: ${reason}`);
            throw new Error(reason);
        }

        // Carry the assigned id back onto the draft, so the next save updates the
        // same order rather than creating a second one.
        if (result.Output.OrderHeaderID) {
            draft.SetHeader({ OrderHeaderID: result.Output.OrderHeaderID });
        }
        return result.Output;
    }

    /**
     * Confirm an order — the irreversible step.
     *
     * THIS IS THE ONLY PLACE THE ENGINE RUNS. There is no dry run in front of it any
     * more: the confirm either books — journal entries, subscriptions, entitlements,
     * the initial payment, all in one transaction — or it is refused with a reason,
     * and the reason is what the screen shows. Every rule that used to be pre-checked
     * is still enforced, by `OrderEntityServer.ValidateAsync` and the booking walk;
     * what changed is that we let it speak for itself instead of asking it twice.
     */
    public async Confirm(draft: OrderDraft): Promise<OrdersConfirmOrderOutput | null> {
        const op = new OrdersConfirmOrderOperation();
        const result = await op.Execute({ Draft: draft.ToInput() });

        // A FAILED CONFIRM MUST THROW. This used to read
        //
        //     return result.Success && result.Output ? result.Output : (result.Output ?? null);
        //
        // — a ternary whose branches are the same expression, so `Success` was evaluated and
        // discarded. The operation returns an Output object on failure too (it carries the reason),
        // so a rejected confirm came back looking exactly like a successful one. The workspace then
        // stamped the tab 'Confirmed', marked it clean and moved the stage stepper, while NOTHING
        // had been booked — and `result.Message`, the only text saying why, was dropped on the
        // floor. That is the silent confirm: the screen said yes, the database had no order, and
        // there was no error anywhere to find.
        //
        // Throwing is what the caller is already written for: it catches and renders the message.
        // TWO `Success` FLAGS, AND THE OUTER ONE IS NOT THE ANSWER. `RemoteOpResult.Success` means
        // the operation EXECUTED — it is true for a confirm the engine deliberately refused. The
        // domain outcome is `Output.Success`, with the reason in `Output.Message` / `Output.Blockers`.
        // A real rejection came back as:
        //
        //     { success: true, resultCode: "SUCCESS",
        //       outputJSON: "{\"Success\":false,\"Message\":\"No GL account is linked for role
        //                     'Accounts Receivable'...\",\"Status\":\"Draft\",\"Blockers\":[...]}" }
        //
        // so checking only the envelope reports a refusal as a success. Both are checked here.
        if (!result.Success) {
            throw new Error(result.ErrorMessage?.trim() || 'The order could not be confirmed.');
        }
        const output = result.Output ?? null;
        if (output && output.Success === false) {
            // Prefer a blocker: they are written for the person taking the order, and the top-level
            // Message is sometimes the same sentence repeated by each layer that re-threw it.
            const blocker = output.Blockers?.find((b) => b?.Message?.trim())?.Message?.trim();
            const message = blocker || output.Message?.split('\n')[0]?.trim();
            throw new Error(message || 'The order could not be confirmed.');
        }

        // CARRY THE ASSIGNED ID BACK, exactly as `Save()` does. Without it the draft that was
        // just confirmed still believes it has never been persisted, so every screen keyed on
        // `Draft.Header.OrderHeaderID` goes on treating a booked order as an unsaved one — the
        // editor's `loadPersistedDetail()` early-returns, and the money strip keeps showing the
        // pre-confirm estimate instead of the engine's own total, amount paid and balance.
        //
        // `Save()` had this and `Confirm()` did not, which is the kind of asymmetry that reads as
        // correct until you notice that confirming is ALSO a save — the one that matters most.
        if (output?.OrderHeaderID) {
            draft.SetHeader({ OrderHeaderID: output.OrderHeaderID });
        }
        return output;
    }

    /**
     * Load a SAVED order into an editable draft.
     *
     * Opening an existing order did nothing at all before this: the list emitted
     * the row, the section remembered its id, and the editor — which only accepts
     * a Draft — was handed a blank one. There was no path from an order id to
     * something editable.
     *
     * Unit price is carried across explicitly. The engine resolved it once when
     * the order was taken, and re-resolving on open would silently reprice last
     * year's purchase at today's rules.
     */
    public async LoadDraft(orderHeaderID: string, data: MJOOrdersDataService): Promise<OrderDraft | null> {
        const orders = await data.GetOrders({ MaxRows: 500 });
        const order = orders.find((row: MJOOrderRow) => row.ID === orderHeaderID);
        if (!order) return null;

        const draft = new OrderDraft({
            CompanyID: order.CompanyID,
            OrderHeaderID: order.ID,
        });
        draft.SetHeader({
            BillToOrganizationID: (order['BillToOrganizationID'] as string) ?? null,
            BillToPersonID: (order['BillToPersonID'] as string) ?? null,
            Description: order.Description ?? null,
        });

        for (const line of await data.GetOrderLines(orderHeaderID)) {
            draft.AddLine({
                ProductID: String(line['ProductID'] ?? ''),
                Quantity: Number(line['Quantity'] ?? 0),
                UnitPrice: Number(line['UnitPrice'] ?? 0),
                DiscountPct: Number(line['DiscountPct'] ?? 0) || undefined,
            });
        }

        return draft;
    }

    /** Cancel any pending pricing pass — call from a component's `ngOnDestroy`. */
    public CancelPending(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }
}

/** Round to cents the way the engine does, so client and server agree on the last penny. */
function round(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
