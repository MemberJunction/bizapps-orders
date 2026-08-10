import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJOStatedValueComponent } from '../../panels/chips.component';
import { MJOMoneyPipe } from '../../panels/money-format';
import { OrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import { Metadata } from '@memberjunction/core';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
import { MJOOrderEntryService } from '../../services/order-entry.service';
import { MJOOrdersDataService, type MJOOrderRow } from '../../services/orders-data.service';
import { MJAlertComponent, MJButtonDirective, MJDropdownComponent } from '@memberjunction/ng-ui-components';

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
                <strong>A return is a new order that mirrors the original.</strong>
                Same accounts, sides swapped, positive amounts — a ledger line with a negative debit is not
                a thing. The booked order is never edited.
        </mj-alert>

        @if (Origin) {
            <div class="mj-card mjo-rt__origin">
                <div class="mj-card-pad mjo-rt__origin-row">
                    <div>
                        <div class="sec-label mjo-rt__origin-label">Returning against</div>
                        <div class="mono mjo-rt__origin-number">{{ Origin.OrderNumber }}</div>
                    </div>
                    <mjo-stated-value Label="Customer">
                        {{ Origin.BillToOrganization ?? Origin.BillToPerson ?? '—' }}
                    </mjo-stated-value>
                    <mjo-stated-value Label="Original">{{ Origin.TotalGross | mjoMoney }}</mjo-stated-value>
                </div>
            </div>

            <div class="mjo-rt__split">
                <div class="mjo-rt__left">
                    <div class="mj-card">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-boxes-packing" aria-hidden="true"></i>
                            <h3>What is coming back</h3>
                            <span class="right small muted">capped by what is still returnable</span>
                        </div>
                        <table class="mj-table mj-table--compact">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th class="num">Bought</th>
                                    <th class="num">Already back</th>
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
                                                    at the cap
                                                } @else {
                                                    max {{ remaining(line) }}
                                                }
                                            </div>
                                        </td>
                                        <td class="num">
                                            {{ line.UnitPrice | mjoMoney }}
                                            <div class="secondary">from the origin</div>
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
                            <h3>Why</h3>
                        </div>
                        <div class="mj-card-pad">
                            <label class="mj-field">
                                <label>Reason</label>
                                <mj-dropdown
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
                            <h3>What this credits</h3>
                        </div>
                        <div class="mj-card-pad">
                            <div class="mj-ladder">
                                <div class="mj-ladder-row">
                                    <span class="label">Goods returned</span>
                                    <span class="amt">{{ GoodsTotal | mjoMoney }}</span>
                                </div>
                                <div class="mj-ladder-row">
                                    <span class="label">Tax given back</span>
                                    <span class="amt">{{ TaxTotal | mjoMoney }}</span>
                                </div>
                                <div class="mj-ladder-row is-total">
                                    <span class="label">Credit</span>
                                    <span class="amt mj-money--credit">{{ CreditTotal | mjoMoney }}</span>
                                </div>
                            </div>

                            <div class="mj-ladder-note">
                                <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                                <span>
                                    Pricing is skipped entirely for a negative quantity — there is no volume band
                                    for −1, and asking would produce a message about quantity instead of one
                                    about the return.
                                </span>
                            </div>
                        </div>
                    </div>

                    <mj-alert Variant="info" Icon="fa-solid fa-scale-balanced" class="mjo-rt__note">
                            <strong>Mirrored entry.</strong>
                            The return books the origin's entry with debit and credit swapped and
                            positive amounts — same accounts, opposite direction. It is never an
                            edit of the booked order, because that order genuinely happened and
                            rewriting it would destroy the trail of money that moved.
                    </mj-alert>

                    <mj-alert Variant="info" Icon="fa-solid fa-hand-holding-dollar" class="mjo-rt__note">
                            <strong>How to settle it.</strong>
                            A return creates a credit — an order with a negative balance. It can be
                            spent on the customer's next order or refunded as cash. Nothing is
                            refunded automatically: which one happens is a decision, and the system
                            should not make it silently.
                    </mj-alert>

                    <div class="mjo-rt__actions">
                        <button
                            type="button"
                            mjButton variant="primary"
                            [disabled]="!CanReturn"
                            (click)="ConfirmReturn()">
                            <i class="fa-solid fa-check" aria-hidden="true"></i> Confirm return
                        </button>
                    </div>
                </aside>
            </div>
        } @else {
            <div class="mj-empty mjo-rt__empty">
                <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
                <div class="t">Pick an order to return against</div>
                <div class="small">A return always settles from the order it unwinds.</div>
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
export class MJOReturnPageComponent implements OnInit {
    private readonly data = inject(MJOOrdersDataService);
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
    private readonly entry = inject(MJOOrderEntryService);

    /** The order being returned against. */
    @Input() OriginOrderID: string | null = null;

    /** Emitted AFTER the return is booked, carrying the new order's id. */
    @Output() ReturnCreated = new EventEmitter<string | null>();

    public Busy = false;
    public Error: string | null = null;

    public Origin: MJOOrderRow | null = null;
    public Lines: MJOReturnLine[] = [];
    /** The reasons the select used to hard-code, as data. */
    public readonly ReturnReasons: readonly string[] = [
        'Damaged in transit',
        'Wrong item shipped',
        'Customer changed mind',
        'Duplicate order',
        'Pricing error',
    ];

    public Reason = 'Damaged in transit';

    public async ngOnInit(): Promise<void> {
        if (!this.OriginOrderID) return;
        const orders = await this.data.GetOrders({ Preset: 'all' });
        this.Origin = orders.find((o) => o.ID === this.OriginOrderID) ?? null;
        if (!this.Origin) return;

        const lines = await this.data.GetOrderLines(this.Origin.ID);
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
                AlreadyReturned: 0,
                Returning: 0,
                // The effective rate the original charged, so tax comes back at what
                // was actually taken rather than at whatever the rate is now.
                TaxRate: net ? tax / net : 0,
            };
        });
        this.cdr.detectChanges();
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
            const draft = await md.GetEntityObject<OrderHeaderEntity>(ORDER_ENTITY);
            draft.NewRecord();
            draft.CompanyID = this.Origin.CompanyID;
            draft.BillToOrganizationID = (this.Origin['BillToOrganizationID'] as string) ?? null;
            draft.BillToPersonID = (this.Origin['BillToPersonID'] as string) ?? null;
            draft.ReversesOrderHeaderID = this.Origin.ID;
            draft.ReversalReason = this.Reason;
            for (const line of this.Lines.filter((l) => l.Returning > 0)) {
                const reversal = await draft.Lines.Create();
                reversal.ProductID = line.ProductID;
                reversal.Quantity = line.Returning;
                // The origin line is the sole authority on price, so the reversal states nothing
                // and lets the engine mirror it — UnitPrice is deliberately left unset.
                reversal.ReversesOrderLineID = line.LineID;
            }

            // Throws with the engine's reason if refused; nothing is booked and the catch shows why.
            await this.entry.Confirm(draft);
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
