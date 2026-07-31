import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOStatTileComponent, MJOBarListComponent, type MJOBarRow } from '../../panels/stat-tile.component';
import { MJODayBarsComponent, type MJODayBar } from '../../panels/day-bars.component';
import { MJOOrdersDataService, type MJOPaymentRow } from '../../services/orders-data.service';
import { FormatMoney, MJOMoneyPipe } from '../../panels/money-format';

/**
 * `mjo-payments-dashboard-page` — what came in, and does it tie?
 *
 * The accounting team's first two questions, in that order. The reconciliation
 * tile is not decoration: unallocated cash is structurally always zero here,
 * because a payment cannot capture unless its allocations sum to its amount. That
 * guarantee is worth stating on the screen rather than leaving people to trust it.
 *
 * ## Example
 *
 * ```html
 * <mjo-payments-dashboard-page />
 * ```
 */
@Component({
    selector: 'mjo-payments-dashboard-page',
    standalone: true,
    imports: [CommonModule, MJOStatTileComponent, MJOBarListComponent, MJODayBarsComponent, MJOMoneyPipe],
    template: `
        <div class="mj-stat-grid">
            <mjo-stat-tile
                Label="Cash received"
                Icon="fa-solid fa-hand-holding-dollar"
                [Value]="CapturedTotal"
                [Detail]="CapturedDetail" />

            <mjo-stat-tile
                Label="Unallocated"
                Icon="fa-solid fa-equals"
                Value="$0.00"
                Detail="Always — a payment cannot capture unless it balances" />

            <mjo-stat-tile
                Label="Awaiting capture"
                Icon="fa-solid fa-clock"
                [Value]="PendingTotal"
                [Detail]="PendingDetail" />

            <mjo-stat-tile
                Label="Processor fees"
                Icon="fa-solid fa-receipt"
                [Value]="FeeTotal"
                Detail="Our cost, never netted against a customer's balance" />
        </div>

        <div class="mjo-pd__split">
            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-credit-card" aria-hidden="true"></i>
                    <h3>Cash received per day</h3>
                </div>
                <div class="mj-card-pad">
                    <mjo-day-bars [Bars]="CashPerDay" Unit="received" />
                    <div class="small muted mjo-pd__note">
                        Amounts, not counts — one large wire and thirty small cards are the same
                        number of payments and nothing like the same day.
                    </div>
                </div>
            </div>

            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-credit-card" aria-hidden="true"></i>
                    <h3>How they paid</h3>
                </div>
                <div class="mj-card-pad">
                    <mjo-bar-list [Rows]="TenderMix" EmptyText="No payments yet." />
                    <div class="small muted mjo-pd__note">
                        One hue and a label per row. Four tenders in four colours would look like an encoding
                        while encoding nothing — the label already carries the identity.
                    </div>
                </div>
            </div>

            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
                    <h3>Reconciliation</h3>
                </div>
                <div class="mj-card-pad">
                    <div class="mj-banner mj-banner--success">
                        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
                        <div class="body">
                            <strong>Every captured payment balances.</strong>
                            The amount-equals-allocations rule is enforced at the capture transition, so an
                            unbalanced payment cannot exist to be found later.
                        </div>
                    </div>
                    <div class="mj-banner mj-banner--neutral mjo-pd__note">
                        <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                        <div class="body">
                            A refund is a <b>new payment</b>, never an edit of the capture — so chargebacks and
                            reversals show in the refunds list rather than as a mutated original.
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="mjo-pd__split">
            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                    <h3>Latest payments</h3>
                </div>
                <div class="mj-table-wrap">
                    <table class="mj-table mj-table--compact">
                        <thead>
                            <tr>
                                <th>Payment</th>
                                <th>Payer</th>
                                <th>Tender</th>
                                <th class="num">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (payment of LatestPayments; track payment.ID) {
                                <tr>
                                    <td><span class="mono">{{ payment.PaymentNumber }}</span></td>
                                    <td>{{ payerOf(payment) }}</td>
                                    <td>{{ payment.PaymentType ?? '—' }}</td>
                                    <td class="num">{{ payment.Amount | mjoMoney }}</td>
                                </tr>
                            } @empty {
                                <tr><td colspan="4" class="small muted">No payments yet.</td></tr>
                            }
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-receipt" aria-hidden="true"></i>
                    <h3>Cost of taking money</h3>
                </div>
                <div class="mj-card-pad">
                    <div class="mjo-pd__row">
                        <span class="small muted">Processor fees, captured payments</span>
                        <b class="mj-num">{{ FeeTotal }}</b>
                    </div>
                    <div class="mjo-pd__row">
                        <span class="small muted">Effective rate on what we took</span>
                        <b class="mj-num">{{ EffectiveRate }}</b>
                    </div>
                    <div class="small muted mjo-pd__note">
                        Booked as OUR expense against gross A/R, never netted into the customer's
                        balance — netting would leave a residue no payment could ever clear.
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: [
        `
            .mjo-pd__split {
                display: grid;
                grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
                gap: var(--mj-space-4);
                margin-top: var(--mj-space-4);
            }
            .mjo-pd__row {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                gap: var(--mj-space-3);
                padding: 3px 0;
            }
            .mjo-pd__note { margin-top: var(--mj-space-3); }
            @media (max-width: 1000px) {
                .mjo-pd__split { grid-template-columns: 1fr; }
            }

            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            .mjo-pd__split {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: var(--mj-space-4);
                margin-top: var(--mj-space-6);
            }
            .mjo-pd__note { margin-top: var(--mj-space-3); }
            @media (max-width: 1000px) {
                .mjo-pd__split { grid-template-columns: 1fr; }
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOPaymentsDashboardPageComponent implements OnInit {
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

    private payments: MJOPaymentRow[] = [];

    public async ngOnInit(): Promise<void> {
        this.payments = await this.data.GetPayments({ Preset: 'all' });
        this.cdr.detectChanges();
    }

    private get captured(): MJOPaymentRow[] {
        return this.payments.filter((p) => p.Status === 'Captured');
    }

    private get pending(): MJOPaymentRow[] {
        return this.payments.filter((p) => p.Status === 'Pending');
    }

    public get CapturedTotal(): string {
        return FormatMoney(this.captured.reduce((s, p) => s + p.Amount, 0), { Round: true });
    }

    public get CapturedDetail(): string {
        return `${this.captured.length} payment${this.captured.length === 1 ? '' : 's'}`;
    }

    public get PendingTotal(): string {
        return FormatMoney(this.pending.reduce((s, p) => s + p.Amount, 0), { Round: true, Zero: '—' });
    }

    public get PendingDetail(): string {
        return this.pending.length
            ? `${this.pending.length} awaiting capture — allocations still editable`
            : 'Nothing waiting';
    }

    public get FeeTotal(): string {
        return FormatMoney(this.captured.reduce((s, p) => s + (p.ProcessingFeeAmount ?? 0), 0));
    }

    /** Cash by tender, largest first — the eye wants the dominant one immediately. */
    /**
     * The last seven days by AMOUNT, not count.
     *
     * One large wire and thirty small cards are the same number of payments and
     * nothing like the same day, so a count would be the wrong shape of answer
     * for a panel about cash.
     */
    public get CashPerDay(): MJODayBar[] {
        const days: MJODayBar[] = [];
        const today = new Date();
        for (let back = 6; back >= 0; back--) {
            const day = new Date(today);
            day.setDate(day.getDate() - back);
            const iso = day.toISOString().slice(0, 10);
            days.push({
                Label: day.toLocaleDateString('en-US', { weekday: 'short' }),
                Value: Math.round(
                    this.payments
                        .filter((p) => String(p.PaymentDate ?? '').slice(0, 10) === iso)
                        .reduce((sum, p) => sum + Number(p.Amount ?? 0), 0),
                ),
                Current: back === 0,
            });
        }
        return days;
    }

    /** Newest first. */
    public get LatestPayments(): MJOPaymentRow[] {
        return [...this.payments]
            .sort((a, b) => String(b.PaymentDate ?? '').localeCompare(String(a.PaymentDate ?? '')))
            .slice(0, 7);
    }

    /** Who paid, however they are recorded. */
    public payerOf(payment: MJOPaymentRow): string {
        return (payment.BillToOrganization ?? payment.BillToPerson ?? '—') as string;
    }

    /**
     * Fees as a share of what was actually captured.
     *
     * Computed rather than quoted. A hardcoded 2.9% describes a card schedule,
     * not this company's mix, and a business taking mostly ACH would read a card
     * rate as its own cost.
     */
    public get EffectiveRate(): string {
        const captured = this.payments.filter((p) => p.Status === 'Captured');
        const gross = captured.reduce((sum, p) => sum + Number(p.Amount ?? 0), 0);
        const fees = captured.reduce((sum, p) => sum + Number(p.ProcessingFeeAmount ?? 0), 0);
        if (!gross) return '—';
        return `${((fees / gross) * 100).toFixed(2)}%`;
    }

    public get TenderMix(): MJOBarRow[] {
        const totals = new Map<string, number>();
        for (const payment of this.captured) {
            const key = (payment.PaymentType as string) ?? 'Other';
            totals.set(key, (totals.get(key) ?? 0) + payment.Amount);
        }
        return [...totals.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([Label, Value]) => ({ Label, Value, Display: FormatMoney(Value, { Round: true }) }));
    }
}
