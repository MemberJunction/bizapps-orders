import {
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnInit,
    Output,
    SimpleChanges,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJOStatedValueComponent } from '../../panels/chips.component';
import { MJOMoneyPipe } from '../../panels/money-format';
import {
    OrderHeaderEntity,
    OrdersGetPriorReturnsOperation,
    type mjBizAppsOrdersOrderHeaderEntity,
} from '@mj-biz-apps/orders-entities';
import { Metadata } from '@memberjunction/core';

import { MJOPricingScheduler } from '../../services/pricing-scheduler.service';

import { MJAlertComponent, MJButtonDirective, MJDropdownComponent } from '@memberjunction/ng-ui-components';
import { GetOrderLines, GetOrders } from '../../data/orders-queries';
import { MJO_ENTITIES } from '../../data/entity-names';

/** The reason a return opens with, and the one it returns to when the origin changes. */
const DEFAULT_RETURN_REASON = 'Damaged in transit';

/** A line being returned, with the cap the origin imposes. */
interface MJOReturnLine {
    LineID: string;
    /** The reversal line names the same product the origin line sold. */
    ProductID: string;
    LineNumber: number;
    ProductName: string;
    UnitPrice: number;
    Bought: number;
    AlreadyReturned: number;
    Returning: number;
    TaxRate: number;
}

/**
 * `mjo-return-page` — take goods back.
 *
 * A RETURN IS A NEW ORDER THAT MIRRORS THE ORIGINAL — same accounts, debit and
 * credit swapped, positive amounts. It is never an edit of the booked order,
 * because that order genuinely happened and rewriting it would destroy the trail
 * of money that moved.
 *
 * THREE THINGS COME FROM THE ORIGIN LINE, NOT FROM TODAY'S PRICE TABLE: how much
 * is still returnable, what it cost, and which product. Each of them produces a
 * BALANCED journal entry when it goes wrong, so nothing downstream can catch the
 * mistake — a return priced at today's rate refunds last year's purchase at the
 * wrong number and the ledger agrees with itself the whole way.
 *
 * Over-returning is refused outright, and the cap counts prior returns across
 * every order, not just this one.
 *
 * ## Example
 *
 * ```html
 * <mjo-return-page [OriginOrderID]="id" (ReturnCreated)="close()" />
 * ```
 */
@Component({
    selector: 'mjo-return-page',
    standalone: true,
    imports: [MJButtonDirective, MJDropdownComponent, CommonModule, FormsModule, MJOStatedValueComponent, MJOMoneyPipe, MJAlertComponent],
    template: `
        <mj-alert Variant="info" Icon="fa-solid fa-rotate-left" class="mjo-rt__note">
                <strong>A return is recorded as a new order that reverses the original.</strong>
                The original order is not changed.
        </mj-alert>

        <!--
            WHAT WENT WRONG, ON SCREEN. \`Error\` was assigned on three paths — a failed origin load,
            a refused confirm and a thrown confirm — and bound nowhere, so every one of them showed
            the user an unchanged page and no reason. It sits above both branches because two of the
            three happen while the origin card is not rendered.
        -->
        @if (Error) {
            <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-rt__note"
                      data-testid="return-error">
                {{ Error }}
            </mj-alert>
        }

        <!-- Work this page discarded on the user's behalf, said out loud rather than done quietly. -->
        @if (Notice) {
            <mj-alert Variant="warning" Icon="fa-solid fa-circle-info" class="mjo-rt__note"
                      data-testid="return-notice">
                {{ Notice }}
            </mj-alert>
        }

        @if (Origin) {
            <div class="mj-card mjo-rt__origin">
                <div class="mj-card-pad mjo-rt__origin-row">
                    <div>
                        <div class="sec-label mjo-rt__origin-label">Original order</div>
                        <div class="mono mjo-rt__origin-number">{{ Origin.OrderNumber }}</div>
                    </div>
                    <mjo-stated-value Label="Customer">
                        {{ Origin.BillToOrganization ?? Origin.BillToPerson ?? '—' }}
                    </mjo-stated-value>
                    <mjo-stated-value Label="Original">{{ Origin.TotalGross | mjoMoney }}</mjo-stated-value>
                    <button type="button" mjButton variant="outline" size="sm" (click)="OpenPicker()">
                        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Change origin order
                    </button>
                </div>
                @if (PickerOpen) {
                    <div class="mj-card-pad mjo-rt__picker">
                        <mj-dropdown
                            AriaLabel="Original order"
                            Placeholder="Choose an order…"
                            [Data]="PickerOrders"
                            TextField="OrderNumber"
                            ValueField="ID"
                            [ValuePrimitive]="true"
                            [Filterable]="true"
                            (ValueChange)="ChooseOrigin($any($event))"
                            name="changeOriginOrder" />
                    </div>
                }
            </div>

            <div class="mjo-rt__split">
                <div class="mjo-rt__left">
                    <div class="mj-card">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-boxes-packing" aria-hidden="true"></i>
                            <h3>Items to return</h3>
                            <span class="right small muted">limited to quantity not yet returned</span>
                        </div>
                        <table class="mj-table mj-table--compact">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th class="num">Bought</th>
                                    <th class="num">Already returned</th>
                                    <th class="num">Returning</th>
                                    <th class="num">Unit</th>
                                    <th class="num">Credit</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (line of Lines; track line.LineID) {
                                    <tr>
                                        <td>{{ line.ProductName }}</td>
                                        <td class="num">{{ line.Bought }}</td>
                                        <td class="num" [class.muted]="!line.AlreadyReturned">
                                            {{ line.AlreadyReturned || '—' }}
                                        </td>
                                        <td class="num">
                                            <input
                                                class="mj-input is-num mjo-rt__qty"
                                                [value]="line.Returning"
                                                (change)="SetQuantity(line, $any($event.target).value)"
                                                [attr.aria-label]="'Quantity returning of ' + line.ProductName">
                                            <div class="secondary">
                                                @if (line.Returning >= remaining(line)) {
                                                    max reached
                                                } @else {
                                                    max {{ remaining(line) }}
                                                }
                                            </div>
                                        </td>
                                        <td class="num">
                                            {{ line.UnitPrice | mjoMoney }}
                                            <div class="secondary">from the original order</div>
                                        </td>
                                        <td class="num strong mj-money--credit">{{ credit(line) | mjoMoney }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>

                    <div class="mj-card mjo-rt__reason">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-comment-dots" aria-hidden="true"></i>
                            <h3>Reason</h3>
                        </div>
                        <div class="mj-card-pad">
                            <label class="mj-field">
                                <mj-dropdown
                                    AriaLabel="Reason"
                                    [Data]="ReturnReasons"
                                    [ValuePrimitive]="true"
                                    [(ngModel)]="Reason"
                                    name="reason" />
                            </label>
                        </div>
                    </div>
                </div>

                <aside class="mjo-rt__right">
                    <div class="mj-card">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-calculator" aria-hidden="true"></i>
                            <h3>Credit summary</h3>
                        </div>
                        <div class="mj-card-pad">
                            <div class="mj-ladder">
                                <div class="mj-ladder-row">
                                    <span class="label">Goods returned</span>
                                    <span class="amt">{{ GoodsTotal | mjoMoney }}</span>
                                </div>
                                <div class="mj-ladder-row">
                                    <span class="label">Tax refunded</span>
                                    <span class="amt">{{ TaxTotal | mjoMoney }}</span>
                                </div>
                                <div class="mj-ladder-row is-total">
                                    <span class="label">Credit</span>
                                    <span class="amt mj-money--credit">{{ CreditTotal | mjoMoney }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <mj-alert Variant="info" Icon="fa-solid fa-scale-balanced" class="mjo-rt__note">
                            <strong>Accounting.</strong>
                            The return posts a reversing entry against the original order's accounts.
                            The original entry is not changed.
                    </mj-alert>

                    <mj-alert Variant="info" Icon="fa-solid fa-hand-holding-dollar" class="mjo-rt__note">
                            <strong>Settlement.</strong>
                            The return creates a credit on the customer's account. Apply it to another
                            order or issue a refund. Refunds are not issued automatically.
                    </mj-alert>

                    <div class="mjo-rt__actions">
                        <button
                            type="button"
                            mjButton variant="primary"
                            [disabled]="!CanReturn || Busy"
                            (click)="ConfirmReturn()">
                            <i class="fa-solid fa-check" aria-hidden="true"></i>
                            {{ Busy ? 'Confirming…' : 'Confirm return' }}
                        </button>
                    </div>
                </aside>
            </div>
        } @else {
            <div class="mj-empty mjo-rt__empty">
                <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
                <div class="t">Select an order to return</div>
                <div class="small">Choose the original order to start a return.</div>
                <!--
                    THREE STATES, NOT TWO. "Not asked yet" and "asked and got nothing" used to render
                    the same sentence, so the "no booked orders" message flashed on every open — and a
                    FAILED query returns an empty list too, which would have told the user the
                    business has no confirmed orders when the truth was that the read did not work.
                -->
                @if (!PickerLoaded) {
                    <div class="small muted mjo-rt__picker" data-testid="picker-loading">Loading orders…</div>
                } @else if (PickerOrders.length) {
                    <div class="mjo-rt__picker">
                        <mj-dropdown
                            AriaLabel="Original order"
                            Placeholder="Choose an order…"
                            [Data]="PickerOrders"
                            TextField="OrderNumber"
                            ValueField="ID"
                            [ValuePrimitive]="true"
                            [Filterable]="true"
                            (FilterChange)="FilterOrders($any($event))"
                            (ValueChange)="ChooseOrigin($any($event))"
                            name="originOrder" />
                    </div>
                } @else {
                    <div class="small muted mjo-rt__picker" data-testid="picker-empty">
                        No confirmed orders came back to return against. An order has to be confirmed
                        before it can be reversed — if you expected one here, the read may have failed.
                    </div>
                }
            </div>
        }
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            .mjo-rt__note { margin-bottom: var(--mj-space-4); }
            .mjo-rt__origin { margin-bottom: var(--mj-space-4); }
            .mjo-rt__origin-row {
                display: flex;
                gap: var(--mj-space-6);
                align-items: center;
                flex-wrap: wrap;
            }
            .mjo-rt__origin-label { margin: 0 0 3px; }
            .mjo-rt__origin-number { font-size: 15px; font-weight: var(--mj-font-bold); }
            .mjo-rt__split { display: flex; gap: var(--mj-space-4); align-items: flex-start; }
            .mjo-rt__left { flex: 1; min-width: 0; }
            .mjo-rt__right { flex: 0 0 340px; min-width: 0; }
            .mjo-rt__reason { margin-top: var(--mj-space-4); }
            .mjo-rt__qty { width: 74px; }
            .mjo-rt__actions { margin-top: var(--mj-space-4); }
            .mjo-rt__empty { padding: var(--mj-space-12); }
            /* The picker reads as one control rather than filling the card, and is centred in the
               empty state because everything above it there is centred too. */
            .mjo-rt__picker {
                margin: var(--mj-space-4) auto 0;
                max-width: 340px;
                text-align: left;
            }
            /* The origin row pushes its action to the right, as the approved design does. */
            .mjo-rt__origin-row > button { margin-left: auto; }

            @media (max-width: 1100px) {
                .mjo-rt__split { flex-direction: column; }
                .mjo-rt__left, .mjo-rt__right { flex: 1 1 auto; width: 100%; }
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOReturnPageComponent implements OnInit, OnChanges {
    /**
     * Render what was just loaded.
     *
     * These pages are created imperatively by the section shell through
     * `ViewContainerRef.createComponent`. When an async load assigns across
     * Angular's check/verify boundary, dev mode raises NG0100 and ABORTS the DOM
     * write. Nothing re-renders afterwards, so the recorded "previous" value stays
     * pre-load while the getter returns the loaded one — the mismatch then repeats
     * on every tick and the view is frozen for good. It is not a flicker: the
     * Orders dashboard sat at "0 open orders / $0.00" against 73 real orders, and
     * read as a quiet day rather than a broken screen.
     *
     * Writing the DOM here ends it: the rendered value matches the getter from the
     * first pass on, so later verify passes agree.
     */
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly entry = inject(MJOPricingScheduler);

    /**
     * The order being returned against.
     *
     * Optional, and it was the ONLY way in until the picker below existed — which is why golive#250
     * reported the page as unreachable: nothing in the repo ever set it, so the page showed its
     * "choose the original order" empty state and offered nothing to choose with.
     */
    @Input() OriginOrderID: string | null = null;

    /**
     * The order actually being returned against — the component's own state, NOT the `@Input`.
     *
     * `ChooseOrigin` used to assign `this.OriginOrderID`. Angular diffs an input against the last
     * value IT bound, so after the picker wrote one, a parent binding that SAME id produced no
     * `ngOnChanges` and the page quietly refused to reload. Writing your own input also means the
     * parent and the child disagree about who owns it. The input is now read-only to this class:
     * `ngOnInit`/`ngOnChanges` copy it in, the picker sets this directly, and everything downstream
     * reads this.
     */
    private selectedOriginID: string | null = null;

    /**
     * THE ORIGIN PICKER (golive#250, and `mockups/orders/return.html`'s `<!-- origin picker -->`).
     *
     * Only BOOKED orders are offered, because that is what a return reverses — `IsBooked` is
     * "journal entries exist and the receivable is real". A Draft or Quoted order has no money to
     * give back, and `ReversalResolver` skips Draft and Voided on the server, so offering one would
     * be offering a choice the server refuses.
     *
     * Filtered server-side rather than fetched-and-filtered: `MJOGetOrdersOptions` records a real
     * performance bug from doing the latter, and a returns picker on a long-lived instance is
     * exactly where it would bite.
     */
    public PickerOrders: mjBizAppsOrdersOrderHeaderEntity[] = [];
    public PickerOpen = false;

    /**
     * Has the picker's list been ASKED for yet, as distinct from having come back empty?
     *
     * Without this the empty state renders during the initial load and says "no booked orders to
     * return against yet" — so the message flashes on every open, and, worse, `run()` returns `[]`
     * when the query FAILS. `orders-queries` argues that case against itself: *"an empty state is
     * the most reassuring thing on the screen. A failed query that reads as good news is the worst
     * outcome available."* A broken returns page would have told the user the business has no
     * confirmed orders.
     */
    public PickerLoaded = false;

    /**
     * Which origin load is the current one.
     *
     * `LoadOrigin` awaits three times — the order, its lines, then the prior returns — and assigns to
     * shared fields after each. The picker is on screen THROUGHOUT, because the load clears `Origin`
     * first and the `@else` branch renders, so a second pick starts a second pass. Without this the
     * slower response lands last and `Origin` and `Lines` can end up describing different orders,
     * which `ConfirmReturn` would then book. Narrow window; wrong money.
     */
    private originLoadToken = 0;

    /** Emitted AFTER the return is booked, carrying the new order's id. */
    @Output() ReturnCreated = new EventEmitter<string | null>();

    public Busy = false;
    public Error: string | null = null;

    public Origin: mjBizAppsOrdersOrderHeaderEntity | null = null;
    public Lines: MJOReturnLine[] = [];
    /** The reasons the select used to hard-code, as data. */
    public readonly ReturnReasons: readonly string[] = [
        'Damaged in transit',
        'Wrong item shipped',
        'Customer changed mind',
        'Duplicate order',
        'Pricing error',
    ];

    public Reason = DEFAULT_RETURN_REASON;

    /** A non-blocking note about something the page did on the user's behalf, such as clearing work. */
    public Notice: string | null = null;

    public async ngOnInit(): Promise<void> {
        // The input is copied in, never written back — see `selectedOriginID`.
        this.selectedOriginID = this.OriginOrderID;
        await this.LoadReturnableOrders();
        await this.LoadOrigin();
    }

    /**
     * THE INPUT CAN ARRIVE AFTER CONSTRUCTION, and `ngOnInit` runs once.
     *
     * The section shell hands a cached page its record with `setInput(...)`, which runs `ngOnChanges`
     * and nothing else. Without this the page would load an order only when it happened to be
     * constructed with one already set, and silently keep showing the previous origin otherwise —
     * the shape `order-document.page.ts` still has.
     */
    public async ngOnChanges(changes: SimpleChanges): Promise<void> {
        if (changes['OriginOrderID'] && !changes['OriginOrderID'].firstChange) {
            this.selectedOriginID = this.OriginOrderID;
            await this.LoadOrigin();
        }
    }

    /** The orders a return may be written against — see `PickerOrders`. */
    private async LoadReturnableOrders(search?: string): Promise<void> {
        this.PickerOrders = await GetOrders({ Preset: 'booked', MaxRows: 200, Search: search?.trim() || undefined });
        this.PickerLoaded = true;
        this.cdr.detectChanges();
    }

    /**
     * Re-ask the SERVER as the user types, rather than filtering the page we already hold.
     *
     * `MaxRows: 200` caps the list, and `run()` reports truncation only when no explicit cap was
     * given — deliberately, because an explicit cap usually means a caller that WANTED a short list.
     * That reasoning does not transfer here: this is the only route into returns, so the cap was
     * silent by construction, and `[Filterable]` does not rescue it because `MJDropdownComponent`
     * filters `Data` in the browser on `TextField`. The 201st-oldest booked order was unreachable by
     * scrolling AND by typing, which turns a performance concern into a correctness one — returns
     * against older orders simply stop being possible.
     *
     * With the text sent to the server the cap stops mattering: the 200 are now the 200 that match.
     */
    public async FilterOrders(search: string): Promise<void> {
        await this.LoadReturnableOrders(search);
    }


    /** Choose the origin from the picker. Same load path as the input, so both routes agree. */
    public async ChooseOrigin(orderID: string | null): Promise<void> {
        if (!orderID) return;
        if (orderID === this.selectedOriginID) {
            // Picking the order already loaded should not discard the quantities typed against it.
            this.PickerOpen = false;
            this.cdr.detectChanges();
            return;
        }
        // WHAT MUST NOT CROSS ORDERS. `LoadOrigin` replaces `Lines`, so quantities typed against the
        // previous order go — correctly, since they name its line ids. `Reason` did NOT reset, so a
        // reason chosen for one order silently became the reason recorded against another. Say when
        // work is discarded rather than doing it quietly.
        const discarding = this.Lines.some((l) => l.Returning > 0);
        this.Reason = DEFAULT_RETURN_REASON;
        this.Notice = discarding
            ? 'Quantities from the previous order were cleared — they belong to its lines, not this one.'
            : null;
        this.Error = null;
        this.selectedOriginID = orderID;
        this.PickerOpen = false;
        // The picker closing is a visible change of its own, and it happens BEFORE the await rather
        // than as a side effect of whatever `LoadOrigin` does after it. `render-after-load` asks for
        // the call in the same body as the assignment for exactly this reason: a tick that only
        // happens across an await boundary is one the caller can move or drop without noticing.
        this.cdr.detectChanges();
        await this.LoadOrigin();
    }

    /** Reopen the picker to swap origins — the design's "Change origin order". */
    public OpenPicker(): void {
        this.PickerOpen = true;
        this.cdr.detectChanges();
    }

    /** Load `OriginOrderID`'s order and its returnable lines, or clear the page if there is none. */
    private async LoadOrigin(): Promise<void> {
        // Claim this pass. Every assignment below is gated on still being the newest one — see
        // `originLoadToken`. A superseded pass returns without touching anything.
        const token = ++this.originLoadToken;
        const current = (): boolean => token === this.originLoadToken;

        this.Lines = [];
        this.Origin = null;
        if (!this.selectedOriginID) {
            this.cdr.detectChanges();
            return;
        }
        // BY ID, not every order then `.find`. `MJOGetOrdersOptions.OrderHeaderID` exists for exactly
        // this and says why: "cheaper and exact where a caller already has the ID". The previous
        // `Preset: 'all'` read the whole table to keep one row — invisible on a fresh instance and
        // steadily worse with every order taken, which is the performance bug that options doc
        // already records against fast entry's customer picker.
        // GUARDED. `GetOrders` THROWS on a malformed id rather than returning nothing, and nothing
        // above catches — so a bad id killed the load mid-flight with `Error` still null, i.e. a
        // blank page and no reason. The `Preset:'all'` + `.find` this replaced could only come back
        // empty, so the throw arrived with the by-id read.
        let orders: mjBizAppsOrdersOrderHeaderEntity[];
        try {
            orders = await GetOrders({ OrderHeaderID: this.selectedOriginID });
        } catch (e) {
            if (!current()) return;
            this.Error = `That order could not be loaded: ${e instanceof Error ? e.message : String(e)}`;
            this.cdr.detectChanges();
            return;
        }
        if (!current()) return;
        this.Origin = orders[0] ?? null;
        if (!this.Origin) {
            this.Error = 'That order could not be loaded.';
            this.cdr.detectChanges();
            return;
        }

        const lines = await GetOrderLines(this.Origin.ID);
        if (!current()) return;
        // WHAT HAS ALREADY GONE BACK, from the server. The cap counts reversals across every order
        // and ignores Draft and Voided ones — the rule `ReversalResolver` refuses with at confirm
        // time. Computing it here from a view would be a second copy of that rule, and the copy on
        // the screen is the one nobody tests. This page used to hard-code the figure to zero, so the
        // maximum it offered ignored earlier returns entirely; the server still refused the
        // over-return, which made the screen wrong rather than dangerous.
        const alreadyReturned = await this.LoadPriorReturns(lines.map((l) => String(l['ID'])));
        if (!current()) return;
        this.Lines = lines.map((line) => {
            const net = Number(line['LineTotalNet'] ?? 0);
            const tax = Number(line['LineTax'] ?? 0);
            return {
                LineID: String(line['ID']),
                ProductID: String(line['ProductID'] ?? ''),
                LineNumber: Number(line['LineNumber'] ?? 0),
                ProductName: String(line['Product'] ?? ''),
                // The origin is the sole authority on price. Re-resolving would
                // refund last year's purchase at today's rate.
                UnitPrice: Number(line['UnitPrice'] ?? 0),
                Bought: Number(line['Quantity'] ?? 0),
                AlreadyReturned: alreadyReturned.get(String(line['ID'])) ?? 0,
                Returning: 0,
                // The effective rate the original charged, so tax comes back at what
                // was actually taken rather than at whatever the rate is now.
                TaxRate: net ? tax / net : 0,
            };
        });
        this.cdr.detectChanges();
    }

    /**
     * Ask the server how much of each line has already been returned.
     *
     * SAYS SO WHEN IT CANNOT ANSWER. A failed lookup and a line with no prior returns both come back
     * as zero, and zero is the permissive direction — it offers the full quantity. The server still
     * refuses an over-return, so nothing wrong can be booked either way, but a screen that quietly
     * offers a quantity it will then reject is worse than one that admits it does not know.
     */
    private async LoadPriorReturns(lineIDs: string[]): Promise<Map<string, number>> {
        const out = new Map<string, number>();
        if (!lineIDs.length) return out;
        const op = new OrdersGetPriorReturnsOperation();
        const result = await op.Execute({ OrderLineIDs: lineIDs });
        if (!result.Success || !result.Output) {
            this.Error =
                result.ErrorMessage?.trim() ||
                'How much of this order has already been returned could not be loaded, so the ' +
                    'maximum shown for each line may be too high.';
            // The caller ticks once it has built its rows, but the warning is assigned after an
            // await in THIS body and a tick elsewhere does not repaint it.
            this.cdr.detectChanges();
            return out;
        }
        for (const row of result.Output.Lines) out.set(row.OrderLineID, row.AlreadyReturned);
        return out;
    }

    /** What may still come back — prior returns count against it. */
    public remaining(line: MJOReturnLine): number {
        return Math.max(0, line.Bought - line.AlreadyReturned);
    }

    public credit(line: MJOReturnLine): number {
        const goods = line.Returning * line.UnitPrice;
        return Math.round(goods * (1 + line.TaxRate) * 100) / 100;
    }

    /**
     * Book the return.
     *
     * A RETURN IS AN ORDER, so it goes through the same transport everything else
     * does: an order whose lines each name the line they reverse, confirmed
     * through `Orders.ConfirmOrder`. There is no separate return operation and
     * there should not be — the reversal rules live in the engine, and a second
     * path to them would be a second place for them to drift.
     *
     * The button previously emitted `ReturnCreated` and nothing else. Nothing
     * subscribed, so "Confirm return" was inert: it looked like it worked, and no
     * goods ever came back.
     */
    public async ConfirmReturn(): Promise<void> {
        if (!this.CanReturn || !this.Origin) return;
        this.Busy = true;
        this.Error = null;
        try {
            // The company is fixed at construction; everything else the return
            // needs is a header patch. A return belongs to the SAME customer and
            // the SAME company as the order it reverses — none of it is a choice.
            const md = new Metadata();
            const draft = await md.GetEntityObject<OrderHeaderEntity>(MJO_ENTITIES.OrderHeader);
            draft.NewRecord();
            draft.CompanyID = this.Origin.CompanyID;
            draft.BillToOrganizationID = (this.Origin['BillToOrganizationID'] as string) ?? null;
            draft.BillToPersonID = (this.Origin['BillToPersonID'] as string) ?? null;
            draft.ReversesOrderHeaderID = this.Origin.ID;
            draft.ReversalReason = this.Reason;
            for (const line of this.Lines.filter((l) => l.Returning > 0)) {
                const reversal = await draft.Lines.Create();
                reversal.ProductID = line.ProductID;
                // NEGATIVE. The sign is not cosmetic and it is not the accounting convention — it is
                // the switch. `OrderJournalEntryFactory` decides whether to mirror an entry by
                // reading `Quantity < 0`, so a positive reversal line books the SALE's entry: it
                // debits the customer again for goods coming back, while the invoice layer labels
                // the document a Credit Memo and the entitlements are revoked. Every other caller
                // writes it negative — `CancelSubscriptionOperation`, the returns checks, D16.
                reversal.Quantity = -Math.abs(line.Returning);
                // The origin line is the sole authority on price, so the reversal states nothing
                // and lets the engine mirror it — UnitPrice is deliberately left unset. Its SERVICE
                // PERIOD is inherited the same way, which is what lets a subscription be returned.
                reversal.ReversesOrderLineID = line.LineID;
            }

            // Throws with the engine's reason if refused; nothing is booked and the catch shows why.
            await draft.Confirm();
            // BOOKED, so this page must stop offering to book it again. `CanReturn` reads
            // `Lines.some(Returning > 0)` and nothing cleared the quantities, so the button stayed
            // live after a success — and the second attempt exceeds the server's already-returned
            // cap and is refused, which before this PR went into an `Error` nobody rendered.
            this.Lines = this.Lines.map((l) => ({ ...l, AlreadyReturned: l.AlreadyReturned + l.Returning, Returning: 0 }));
            this.ReturnCreated.emit(draft.ID ?? null);
        } catch (e) {
            this.Error = e instanceof Error ? e.message : String(e);
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    public SetQuantity(line: MJOReturnLine, raw: string): void {
        const parsed = Number.parseFloat(String(raw).replace(/[^0-9.]/g, ''));
        const next = Number.isFinite(parsed) ? parsed : 0;
        // Over-returning is refused, not warned about — refunding money never
        // collected is not something to let through with a caution.
        line.Returning = Math.max(0, Math.min(next, this.remaining(line)));
    }

    public get GoodsTotal(): number {
        return Math.round(this.Lines.reduce((s, l) => s + l.Returning * l.UnitPrice, 0) * -100) / 100;
    }

    public get TaxTotal(): number {
        return Math.round(this.Lines.reduce((s, l) => s + l.Returning * l.UnitPrice * l.TaxRate, 0) * -100) / 100;
    }

    public get CreditTotal(): number {
        return Math.round((this.GoodsTotal + this.TaxTotal) * 100) / 100;
    }

    public get CanReturn(): boolean {
        return this.Lines.some((l) => l.Returning > 0);
    }

}
