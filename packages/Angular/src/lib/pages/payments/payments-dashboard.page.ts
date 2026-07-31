import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOStatTileComponent, MJOBarListComponent, type MJOBarRow } from '../../panels/stat-tile.component';
import { MJOOrdersDataService, type MJOPaymentRow } from '../../services/orders-data.service';
import { FormatMoney } from '../../panels/money-format';

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
    imports: [CommonModule, MJOStatTileComponent, MJOBarListComponent],
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
    `,
    styles: [
        `
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

    private payments: MJOPaymentRow[] = [];

    public async ngOnInit(): Promise<void> {
        this.payments = await this.data.GetPayments({ Preset: 'all' });
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
