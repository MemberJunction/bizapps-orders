import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrdersApplyAccountCreditOperation } from '@mj-biz-apps/orders-entities';
import { MJOWorklistTableComponent, type MJOColumn } from '../../panels/worklist-table.component';
import { MJOStatedValueComponent } from '../../panels/chips.component';
import { MJOMoneyPipe, FormatMoney } from '../../panels/money-format';
import { MJOOrdersDataService, type MJOOrderRow } from '../../services/orders-data.service';

/**
 * `mjo-account-credit-page` — spend a credit a customer is holding.
 *
 * A CREDIT IS AN ORDER WITH A NEGATIVE BALANCE. There is no credit table, no
 * stored credit balance, no credit-memo record — because a second record holding
 * the same number is a second thing that can disagree with it. That single
 * decision is why this screen looks like a transfer between two orders rather
 * than like drawing down an account.
 *
 * SPENDING ONE WRITES A ZERO-AMOUNT PAYMENT with two offsetting lines: plus on
 * the credit order, minus on the target. No new cash entered the business, so
 * zero is the truth rather than a degenerate case — and the
 * payment-equals-its-lines rule is satisfied exactly.
 *
 * When the two orders belong to different companies the intercompany legs are
 * REQUIRED rather than convenient: a single Dr A/R / Cr A/R spanning two legal
 * entities could not be booked at all, since a resolved account must belong to
 * its own company.
 *
 * ## Example
 *
 * ```html
 * <mjo-account-credit-page (Applied)="refresh()" />
 * ```
 */
@Component({
    selector: 'mjo-account-credit-page',
    standalone: true,
    imports: [CommonModule, FormsModule, MJOWorklistTableComponent, MJOStatedValueComponent, MJOMoneyPipe],
    template: `
        <div class="mj-banner mj-banner--neutral mjo-cr__note">
            <i class="fa-solid fa-piggy-bank" aria-hidden="true"></i>
            <div class="body">
                <strong>A credit is an order with a negative balance.</strong>
                There is no credit table and no stored balance — a second record holding the same number is
                a second thing that can disagree with it. Spending one writes a <b>zero-amount</b> payment
                with two offsetting lines: no new cash entered the business, this only re-attributes money
                already received.
            </div>
        </div>

        <div class="mj-card mjo-cr__list">
            <div class="mj-card-head">
                <i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i>
                <h3>Credits customers are holding</h3>
                <span class="right small muted">{{ TotalDisplay }} across {{ Credits.length }}</span>
            </div>
            <mjo-worklist-table
                [Columns]="CreditColumns"
                [Rows]="Credits"
                [Presets]="[]"
                [Searchable]="false"
                RowKey="ID"
                [SelectedKey]="SourceID"
                EmptyIcon="fa-solid fa-check"
                EmptyTitle="No credits outstanding"
                EmptyHint="Nobody is holding money that has not been spent."
                (RowClicked)="SelectSource($any($event))" />
        </div>

        @if (Source) {
            <div class="mjo-cr__flow">
                <div class="mj-card mjo-cr__side mjo-cr__side--from">
                    <div class="mj-card-pad">
                        <span class="mj-chip mj-chip--success">From — the credit</span>
                        <div class="mjo-cr__order">{{ Source.OrderNumber }}</div>
                        <mjo-stated-value Label="Available">
                            <b class="mj-money--credit">{{ Available | mjoMoney }}</b>
                        </mjo-stated-value>
                        <label class="mj-field mjo-cr__field">
                            <label>Amount to spend</label>
                            <input
                                class="mj-input is-num"
                                [value]="Amount"
                                (change)="SetAmount($any($event.target).value)"
                                aria-label="Amount to spend">
                        </label>
                    </div>
                </div>

                <i class="fa-solid fa-arrow-right mjo-cr__arrow" aria-hidden="true"></i>

                <div class="mj-card mjo-cr__side mjo-cr__side--to">
                    <div class="mj-card-pad">
                        <span class="mj-chip mj-chip--brand">To — an open order</span>
                        <label class="mj-field mjo-cr__field">
                            <label>Target order</label>
                            <select class="mj-select" [(ngModel)]="TargetID" name="target">
                                @for (order of Targets; track order.ID) {
                                    <option [value]="order.ID">
                                        {{ order.OrderNumber }} — {{ money(order.Balance) }}
                                    </option>
                                }
                            </select>
                        </label>
                        @if (Target) {
                            <mjo-stated-value Label="Balance now">{{ Target.Balance | mjoMoney }}</mjo-stated-value>
                            <mjo-stated-value Label="After credit">{{ TargetAfter | mjoMoney }}</mjo-stated-value>
                            @if (IsCrossCompany) {
                                <div class="mj-banner mj-banner--warning mjo-cr__cross">
                                    <i class="fa-solid fa-building-columns" aria-hidden="true"></i>
                                    <div class="body">
                                        <strong>This crosses companies.</strong>
                                        The intercompany legs are required, not optional — a single
                                        Dr A/R / Cr A/R spanning two legal entities could not be booked at all.
                                    </div>
                                </div>
                            }
                        }
                    </div>
                </div>
            </div>

            <div class="mjo-cr__actions">
                <div class="mj-banner mj-banner--neutral mjo-cr__note">
                    <i class="fa-solid fa-scale-balanced" aria-hidden="true"></i>
                    <div class="body">
                        <strong>The payment this writes, and what books.</strong>
                        A payment whose Amount is ZERO, carrying two offsetting allocations: the
                        credit order is drawn down, the target order is settled. Zero is not a
                        degenerate case — no new cash entered the business. The money arrived
                        earlier, on the payment that over-paid the first order; this only
                        re-attributes it, so cash nets to nothing and A/R moves between orders.
                    </div>
                </div>

                <button
                    type="button"
                    class="mj-btn mj-btn--primary"
                    [disabled]="!CanApply || Busy"
                    (click)="Apply()">
                    <i class="fa-solid fa-check" aria-hidden="true"></i>
                    {{ Busy ? 'Applying…' : 'Apply credit' }}
                </button>
                <span class="small muted">No cash moves — this re-attributes money already received.</span>
                @if (Error) {
                    <span class="small mjo-cr__error">{{ Error }}</span>
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
            .mjo-cr__note { margin-bottom: var(--mj-space-4); }
            .mjo-cr__list { margin-bottom: var(--mj-space-6); }
            .mjo-cr__flow {
                display: grid;
                grid-template-columns: 1fr auto 1fr;
                gap: var(--mj-space-4);
                align-items: center;
            }
            .mjo-cr__side--from { border-color: color-mix(in srgb, var(--mj-status-success) 45%, transparent); }
            .mjo-cr__side--to { border-color: color-mix(in srgb, var(--mj-brand-primary) 45%, transparent); }
            .mjo-cr__order {
                font-family: var(--mj-font-family-mono);
                font-size: 15px;
                font-weight: var(--mj-font-bold);
                margin: var(--mj-space-2) 0;
            }
            .mjo-cr__field { margin-top: var(--mj-space-3); }
            .mjo-cr__arrow { color: var(--mj-text-muted); font-size: 20px; }
            .mjo-cr__cross { margin-top: var(--mj-space-3); }
            .mjo-cr__actions {
                display: flex;
                align-items: center;
                gap: var(--mj-space-3);
                margin-top: var(--mj-space-4);
                flex-wrap: wrap;
            }
            .mjo-cr__error { color: var(--mj-status-error-text); }

            @media (max-width: 900px) {
                .mjo-cr__flow { grid-template-columns: 1fr; }
                .mjo-cr__arrow { transform: rotate(90deg); justify-self: center; }
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOAccountCreditPageComponent implements OnInit {
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

    /** A credit was applied. */
    @Output() Applied = new EventEmitter<void>();

    public Credits: MJOOrderRow[] = [];
    public Targets: MJOOrderRow[] = [];
    public SourceID: string | null = null;
    public TargetID: string | null = null;
    public Amount = 0;
    public Busy = false;
    public Error: string | null = null;

    public readonly CreditColumns: MJOColumn<MJOOrderRow>[] = [
        { Key: 'OrderNumber', Label: 'Credit order', Kind: 'mono', Width: '130px' },
        {
            Key: 'Customer',
            Label: 'Customer',
            Format: (r) => (r.BillToOrganization ?? r.BillToPerson ?? '—') as string,
            Secondary: (r) =>
                r.OrderType === 'Return' ? 'from a return' : 'from an over-payment',
        },
        { Key: 'Company', Label: 'Co.', Width: '110px', HideBelow: 760 },
        {
            Key: 'Balance',
            Label: 'Available',
            Kind: 'money',
            Width: '124px',
            Format: (r) => FormatMoney(Math.abs(r.Balance)),
        },
    ];

    public async ngOnInit(): Promise<void> {
        await this.load();
    }

    public get Source(): MJOOrderRow | undefined {
        return this.Credits.find((c) => c.ID === this.SourceID);
    }

    public get Target(): MJOOrderRow | undefined {
        return this.Targets.find((t) => t.ID === this.TargetID);
    }

    public get Available(): number {
        return Math.abs(this.Source?.Balance ?? 0);
    }

    public get TargetAfter(): number {
        return Math.round(((this.Target?.Balance ?? 0) - this.Amount) * 100) / 100;
    }

    public get IsCrossCompany(): boolean {
        return !!this.Source && !!this.Target && this.Source.CompanyID !== this.Target.CompanyID;
    }

    public get CanApply(): boolean {
        return !!this.Source && !!this.Target && this.Amount > 0;
    }

    public get TotalDisplay(): string {
        return FormatMoney(this.Credits.reduce((s, c) => s + Math.abs(c.Balance), 0));
    }

    public async SelectSource(row: MJOOrderRow): Promise<void> {
        await this.applySource(row);
        this.cdr.detectChanges();
    }

    /**
     * Select a credit WITHOUT rendering.
     *
     * The render is split out because the initial load selects the first credit
     * itself. Rendering inside that call put a DOM write between two assignments
     * of the same load, so the header total was written as $0.00 and then changed
     * to $1,784.32 before the load finished — NG0100, which aborts the update and
     * freezes the view. One load, one render.
     */
    private async applySource(row: MJOOrderRow): Promise<void> {
        this.SourceID = row.ID;
        // Only this customer's open orders can receive it — a credit belongs to
        // whoever earned it.
        const customerID = (row['BillToOrganizationID'] as string) ?? undefined;
        this.Targets = await this.data.GetOrders({ Preset: 'unpaid', BillToOrganizationID: customerID });
        this.TargetID = this.Targets[0]?.ID ?? null;
        // Default to the most that both sides allow — the common intent.
        this.Amount = Math.min(this.Available, this.Targets[0]?.Balance ?? 0);
        this.cdr.detectChanges();
    }

    public SetAmount(raw: string): void {
        const parsed = Number.parseFloat(String(raw).replace(/[^0-9.]/g, ''));
        const next = Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
        // Clamped by BOTH sides: you cannot spend credit you do not have, and you
        // cannot over-pay the target through this path — that is what taking a
        // payment is for.
        this.Amount = Math.min(next, this.Available, this.Target?.Balance ?? next);
    }

    public async Apply(): Promise<void> {
        if (!this.CanApply) return;
        this.Busy = true;
        this.Error = null;
        try {
            const op = new OrdersApplyAccountCreditOperation();
            const result = await op.Execute({
                SourceOrderHeaderID: this.SourceID!,
                TargetOrderHeaderID: this.TargetID!,
                Amount: this.Amount,
            });
            if (result.Success && result.Output?.Success) {
                this.Applied.emit();
                await this.load();
            } else {
                this.Error = result.Output?.Message ?? result.ErrorMessage ?? 'The credit could not be applied.';
            }
        } catch (e) {
            this.Error = e instanceof Error ? e.message : String(e);
        } finally {
            this.Busy = false;
        }
        this.cdr.detectChanges();
    }

    protected money(value: number): string {
        return FormatMoney(value);
    }

    /**
     * Load everything, THEN assign, then render once.
     *
     * The order matters. Assigning `Credits` and only afterwards awaiting the
     * targets leaves a window where a tick can run: the header total reads
     * $1,784.32 from the new data while the DOM still says $0.00 from before the
     * load, and dev mode aborts the update. Splitting the render out of
     * `applySource` was not enough on its own, because the ASSIGNMENT was still
     * straddling an await.
     *
     * Nothing is written to the component until every await has settled.
     */
    private async load(): Promise<void> {
        const credits = await this.data.GetOrders({ Preset: 'credits' });
        const first = !this.SourceID ? credits[0] : undefined;

        const targets = first
            ? await this.data.GetOrders({
                  Preset: 'unpaid',
                  BillToOrganizationID: (first['BillToOrganizationID'] as string) ?? undefined,
              })
            : [];

        this.Credits = credits;
        if (first) {
            this.SourceID = first.ID;
            this.Targets = targets;
            this.TargetID = targets[0]?.ID ?? null;
            this.Amount = Math.min(this.Available, targets[0]?.Balance ?? 0);
        }
        this.cdr.detectChanges();
    }
}
